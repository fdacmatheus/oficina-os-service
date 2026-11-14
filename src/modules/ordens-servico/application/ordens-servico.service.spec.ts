import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MetricasService } from 'src/shared/observabilidade/metricas.service';
import { OrdemServico } from '../domain/ordem-servico.entity';
import { StatusOS } from '../domain/status-os';
import { HistoricoEmMemoria, OrdensEmMemoria, uowDireta, valorContador } from '../__testes__/fakes';
import { OrdensServicoService } from './ordens-servico.service';
import { SagaOrdemServicoService } from './saga-ordem-servico.service';

describe('OrdensServicoService', () => {
  let ordens: OrdensEmMemoria;
  let historico: HistoricoEmMemoria;
  let metricas: MetricasService;
  let saga: { iniciar: jest.Mock; cancelarPelaOficina: jest.Mock };
  let veiculos: { findById: jest.Mock };
  let service: OrdensServicoService;

  beforeEach(() => {
    ordens = new OrdensEmMemoria();
    historico = new HistoricoEmMemoria();
    metricas = new MetricasService();
    saga = { iniciar: jest.fn(), cancelarPelaOficina: jest.fn() };
    veiculos = { findById: jest.fn().mockResolvedValue({ id: 'v', clienteId: 'c' }) };
    service = new OrdensServicoService(
      ordens,
      historico,
      uowDireta,
      saga as unknown as SagaOrdemServicoService,
      { findById: jest.fn().mockResolvedValue({ id: 'c' }) } as never,
      veiculos as never,
      { findById: jest.fn().mockResolvedValue({ id: 's', nome: 'Troca', preco: 150 }) } as never,
      {
        findById: jest.fn().mockResolvedValue({ id: 'p', nome: 'Óleo', precoUnitario: 40 }),
      } as never,
      metricas,
    );
  });

  const abrir = () =>
    service.create({
      clienteId: 'c',
      veiculoId: 'v',
      servicos: [{ servicoId: 's' }],
      pecas: [{ pecaId: 'p', quantidade: 2 }],
    });

  it('cria a OS com os itens do catálogo e inicia a saga', async () => {
    const os = await abrir();
    expect(os.itens.map((i) => [i.tipo, i.quantidade, i.precoUnitario])).toEqual([
      ['SERVICO', 1, 150],
      ['PECA', 2, 40],
    ]);
    expect(saga.iniciar).toHaveBeenCalledWith(expect.objectContaining({ id: os.id }));
    expect(await valorContador(metricas, 'oficina_ordens_servico_criadas_total')).toBe(1);
  });

  it('aceita OS só com serviços (quantidade padrão 1) ou só com peças', async () => {
    const soServico = await service.create({
      clienteId: 'c',
      veiculoId: 'v',
      servicos: [{ servicoId: 's' }],
    });
    expect(soServico.itens.map((i) => [i.tipo, i.quantidade])).toEqual([['SERVICO', 1]]);
    const soPeca = await service.create({
      clienteId: 'c',
      veiculoId: 'v',
      pecas: [{ pecaId: 'p', quantidade: 3 }],
    });
    expect(soPeca.itens.map((i) => [i.tipo, i.quantidade])).toEqual([['PECA', 3]]);
  });

  it('recusa veículo de outro cliente', async () => {
    veiculos.findById.mockResolvedValue({ id: 'v', clienteId: 'outro' });
    await expect(abrir()).rejects.toThrow(BadRequestException);
  });

  it('recusa OS sem itens', async () => {
    await expect(service.create({ clienteId: 'c', veiculoId: 'v' })).rejects.toThrow('ao menos um');
    await expect(
      service.create({ clienteId: 'c', veiculoId: 'v', servicos: [], pecas: [] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('conta erro e propaga quando a saga falha ao iniciar', async () => {
    saga.iniciar.mockRejectedValue(new Error('outbox fora'));
    await expect(abrir()).rejects.toThrow('outbox fora');
    expect(
      await valorContador(metricas, 'oficina_ordem_servico_erros_total', { operacao: 'criar' }),
    ).toBe(1);
  });

  it('lista em ordem de prioridade e esconde as encerradas sem filtro', async () => {
    const a = await ordens.create(
      new OrdemServico({ clienteId: 'c', veiculoId: 'v', recebidaEm: 2 }),
    );
    const b = await ordens.create(
      new OrdemServico({
        clienteId: 'c',
        veiculoId: 'v',
        status: StatusOS.EM_EXECUCAO,
        recebidaEm: 3,
      }),
    );
    const c = await ordens.create(
      new OrdemServico({ clienteId: 'c', veiculoId: 'v', recebidaEm: 1 }),
    );
    await ordens.create(
      new OrdemServico({ clienteId: 'c', veiculoId: 'v', status: StatusOS.CANCELADA }),
    );
    expect((await service.findAll()).map((o) => o.id)).toEqual([b.id, c.id, a.id]);
    expect(await service.findAll({ status: StatusOS.CANCELADA })).toHaveLength(1);
  });

  it('busca por id e número, com 404 quando não existe', async () => {
    const os = await abrir();
    expect((await service.findById(os.id!)).numero).toBe(os.numero);
    expect((await service.findByNumero(os.numero!)).id).toBe(os.id);
    await expect(service.findById('x')).rejects.toThrow(NotFoundException);
    await expect(service.findByNumero(999)).rejects.toThrow(NotFoundException);
  });

  it('entrega OS finalizada e registra no histórico', async () => {
    const os = await ordens.create(
      new OrdemServico({ clienteId: 'c', veiculoId: 'v', status: StatusOS.FINALIZADA }),
    );
    expect((await service.entregar(os.id!)).status).toBe(StatusOS.ENTREGUE);
    expect(await service.historicoDe(os.id!)).toEqual([
      expect.objectContaining({
        evento: 'Entregue',
        statusAnterior: 'FINALIZADA',
        statusNovo: 'ENTREGUE',
      }),
    ]);
  });

  it('não entrega OS que não está finalizada, nem inexistente', async () => {
    const os = await abrir();
    await expect(service.entregar(os.id!)).rejects.toThrow(BadRequestException);
    await expect(service.entregar('x')).rejects.toThrow(NotFoundException);
  });

  it('cancelar delega à saga e traduz erros', async () => {
    const os = await abrir();
    saga.cancelarPelaOficina.mockResolvedValueOnce(os);
    expect(await service.cancelar(os.id!, 'motivo')).toBe(os);
    expect(saga.cancelarPelaOficina).toHaveBeenCalledWith(os.id, 'motivo');

    saga.cancelarPelaOficina.mockResolvedValueOnce(null);
    await expect(service.cancelar('x')).rejects.toThrow(NotFoundException);

    saga.cancelarPelaOficina.mockRejectedValueOnce(new Error('Transição inválida'));
    await expect(service.cancelar(os.id!)).rejects.toThrow(BadRequestException);
  });

  it('expõe o tempo médio de execução', async () => {
    expect(await service.tempoMedioExecucaoMs()).toBeNull();
  });
});
