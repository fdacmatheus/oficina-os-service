import { OrdemServico } from '../domain/ordem-servico.entity';
import { StatusOS } from '../domain/status-os';
import { OrdensServicoService } from '../application/ordens-servico.service';
import { OrdensServicoController } from './ordens-servico.controller';
import { OrdensServicoPublicoController } from './ordens-servico-publico.controller';
import { OrdemServicoPresenter } from './ordem-servico.presenter';

const os = new OrdemServico({
  id: 'os-1',
  numero: 7,
  clienteId: 'c',
  veiculoId: 'v',
  status: StatusOS.AGUARDANDO_PAGAMENTO,
  itens: [
    {
      id: 'i',
      tipo: 'PECA',
      referenciaId: 'p',
      descricao: 'Óleo',
      quantidade: 2,
      precoUnitario: 40,
    },
  ],
  orcamentoId: 'orc',
  valorOrcamento: 80,
  estoqueReservado: true,
  recebidaEm: 1000,
});
const historico = [
  {
    osId: 'os-1',
    evento: 'OrdemServicoAberta',
    statusAnterior: null,
    statusNovo: StatusOS.RECEBIDA,
    em: 1000,
  },
  {
    osId: 'os-1',
    evento: 'OrcamentoGerado',
    statusAnterior: StatusOS.RECEBIDA,
    statusNovo: StatusOS.AGUARDANDO_APROVACAO,
    detalhe: 'x',
    em: 2000,
  },
];

describe('controllers da OS', () => {
  const service = {
    create: jest.fn().mockResolvedValue(os),
    findAll: jest.fn().mockResolvedValue([os]),
    findById: jest.fn().mockResolvedValue(os),
    findByNumero: jest.fn().mockResolvedValue(os),
    historicoDe: jest.fn().mockResolvedValue(historico),
    entregar: jest.fn().mockResolvedValue(os),
    cancelar: jest.fn().mockResolvedValue(os),
    tempoMedioExecucaoMs: jest.fn().mockResolvedValue(42),
  };
  const admin = new OrdensServicoController(service as unknown as OrdensServicoService);
  const publico = new OrdensServicoPublicoController(service as unknown as OrdensServicoService);

  it('abre a OS e devolve o detalhe com o estado da saga', async () => {
    const r = await admin.create({ clienteId: 'c', veiculoId: 'v' });
    expect(r.saga).toEqual({
      orcamentoId: 'orc',
      valorOrcamento: 80,
      pagamentoId: null,
      execucaoId: null,
      estoqueReservado: true,
      motivoCancelamento: null,
    });
    expect(r.totalItens).toBe(80);
    expect(r.itens[0].subtotal).toBe(80);
  });

  it('lista com filtros', async () => {
    const r = await admin.findAll(StatusOS.RECEBIDA, 'c');
    expect(service.findAll).toHaveBeenCalledWith({ status: StatusOS.RECEBIDA, clienteId: 'c' });
    expect(r).toEqual([OrdemServicoPresenter.summary(os)]);
    expect(r[0].recebidaEm).toBe(1000);
  });

  it('expõe tempo médio, detalhe, histórico, entrega e cancelamento', async () => {
    expect(await admin.tempoMedio()).toEqual({ tempoMedioMs: 42 });
    expect((await admin.findOne('os-1')).numero).toBe(7);
    expect(await admin.historico('os-1')).toEqual([
      {
        evento: 'OrdemServicoAberta',
        statusAnterior: null,
        statusNovo: 'RECEBIDA',
        detalhe: null,
        em: 1000,
      },
      {
        evento: 'OrcamentoGerado',
        statusAnterior: 'RECEBIDA',
        statusNovo: 'AGUARDANDO_APROVACAO',
        detalhe: 'x',
        em: 2000,
      },
    ]);
    expect((await admin.entregar('os-1')).id).toBe('os-1');
    await admin.cancelar('os-1', { motivo: 'desistiu' });
    expect(service.cancelar).toHaveBeenCalledWith('os-1', 'desistiu');
  });

  it('consulta pública traz status, datas e histórico, sem ids internos', async () => {
    const r = await publico.porNumero(7);
    expect(r).toMatchObject({ numero: 7, status: 'AGUARDANDO_PAGAMENTO', valorOrcamento: 80 });
    expect(r.datas.recebidaEm).toBe(1000);
    expect(r.historico).toHaveLength(2);
    expect(r).not.toHaveProperty('clienteId');
  });
});
