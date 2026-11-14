import { randomUUID } from 'node:crypto';
import { ClientesService } from 'src/modules/clientes/application/clientes.service';
import { PecaRepository } from 'src/modules/pecas/domain/peca.repository';
import { VeiculosService } from 'src/modules/veiculos/application/veiculos.service';
import { Envelope } from 'src/shared/mensageria/envelope';
import { MetricasService } from 'src/shared/observabilidade/metricas.service';
import { NotificacaoPort } from '../application/notificacao.port';
import { SagaOrdemServicoService } from '../application/saga-ordem-servico.service';
import { OrdemServico } from '../domain/ordem-servico.entity';
import { StatusOS } from '../domain/status-os';
import {
  EstoqueEmMemoria,
  HistoricoEmMemoria,
  InboxEmMemoria,
  OrdensEmMemoria,
  OutboxEmMemoria,
  uowDireta,
} from './fakes';

export const CLIENTE = {
  id: 'cliente-1',
  nome: 'João da Silva',
  email: 'joao@exemplo.com',
  documento: '52998224725',
};
export const VEICULO = {
  id: 'veiculo-1',
  clienteId: CLIENTE.id,
  placa: 'ABC1D23',
  marca: 'VW',
  modelo: 'Gol',
};

/** Monta o orquestrador com tudo em memória e oferece atalhos para simular os outros serviços. */
export function montarCenario(estoqueInicial: Record<string, number> = { 'peca-oleo': 10 }) {
  const ordens = new OrdensEmMemoria();
  const historico = new HistoricoEmMemoria();
  const estoque = new EstoqueEmMemoria({ ...estoqueInicial });
  const outbox = new OutboxEmMemoria();
  const inbox = new InboxEmMemoria();
  const metricas = new MetricasService();
  const clientes = { findById: jest.fn().mockResolvedValue(CLIENTE) };
  const veiculos = { findById: jest.fn().mockResolvedValue(VEICULO) };
  const notificacao: jest.Mocked<NotificacaoPort> = {
    notificarMudancaStatus: jest.fn().mockResolvedValue(undefined),
  };

  const saga = new SagaOrdemServicoService(
    ordens,
    historico,
    estoque as unknown as PecaRepository,
    outbox,
    inbox,
    uowDireta,
    clientes as unknown as ClientesService,
    veiculos as unknown as VeiculosService,
    metricas,
    notificacao,
  );

  async function abrirOS(
    pecas: { id: string; quantidade: number }[] = [{ id: 'peca-oleo', quantidade: 4 }],
  ) {
    const os = new OrdemServico({ clienteId: CLIENTE.id, veiculoId: VEICULO.id });
    os.adicionarItem({
      tipo: 'SERVICO',
      referenciaId: 'servico-troca',
      descricao: 'Troca de óleo',
      quantidade: 1,
      precoUnitario: 150,
    });
    for (const p of pecas) {
      os.adicionarItem({
        tipo: 'PECA',
        referenciaId: p.id,
        descricao: `Peça ${p.id}`,
        quantidade: p.quantidade,
        precoUnitario: 40,
      });
    }
    const salva = await ordens.create(os);
    await saga.iniciar(salva);
    return salva.id as string;
  }

  function envelope(type: string, osId: string, payload: Record<string, unknown> = {}): Envelope {
    return {
      messageId: randomUUID(),
      type,
      correlationId: osId,
      occurredAt: Date.now(),
      source: 'teste',
      payload: { osId, ...payload },
    };
  }

  async function receber(type: string, osId: string, payload: Record<string, unknown> = {}) {
    const msg = envelope(type, osId, payload);
    await saga.tratar(msg);
    return msg;
  }

  async function status(osId: string): Promise<StatusOS> {
    return (await ordens.findById(osId))!.status;
  }

  /** Leva a OS até o estado pedido seguindo o caminho feliz. */
  async function ate(osId: string, alvo: StatusOS) {
    const passos: [StatusOS, () => Promise<unknown>][] = [
      [
        StatusOS.AGUARDANDO_APROVACAO,
        () =>
          receber('OrcamentoGerado', osId, {
            orcamentoId: 'orc-1',
            valorTotal: 310,
            linkAprovacao: 'http://billing/orc-1',
          }),
      ],
      [
        StatusOS.AGUARDANDO_PAGAMENTO,
        () => receber('OrcamentoAprovado', osId, { orcamentoId: 'orc-1' }),
      ],
      [
        StatusOS.AGUARDANDO_EXECUCAO,
        () =>
          receber('PagamentoAprovado', osId, {
            orcamentoId: 'orc-1',
            pagamentoId: 'pag-1',
            valor: 310,
          }),
      ],
      [
        StatusOS.EM_EXECUCAO,
        () => receber('ExecucaoAtualizada', osId, { execucaoId: 'exe-1', etapa: 'EM_DIAGNOSTICO' }),
      ],
      [StatusOS.FINALIZADA, () => receber('ExecucaoFinalizada', osId, { execucaoId: 'exe-1' })],
    ];
    for (const [chegada, passo] of passos) {
      if ((await status(osId)) === alvo) return;
      await passo();
      if ((await status(osId)) !== chegada) throw new Error(`esperava ${chegada}`);
    }
  }

  return {
    saga,
    ordens,
    historico,
    estoque,
    outbox,
    inbox,
    metricas,
    clientes,
    veiculos,
    notificacao,
    abrirOS,
    envelope,
    receber,
    status,
    ate,
  };
}

export type Cenario = ReturnType<typeof montarCenario>;
