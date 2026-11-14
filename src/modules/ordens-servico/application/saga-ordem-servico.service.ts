import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ClientesService } from 'src/modules/clientes/application/clientes.service';
import { PECA_REPOSITORY, PecaRepository } from 'src/modules/pecas/domain/peca.repository';
import { VeiculosService } from 'src/modules/veiculos/application/veiculos.service';
import { criarEnvelope, Envelope, Fila } from 'src/shared/mensageria/envelope';
import {
  INBOX,
  Inbox,
  ManipuladorMensagem,
  OUTBOX,
  Outbox,
} from 'src/shared/mensageria/mensageria.port';
import { MetricasService } from 'src/shared/observabilidade/metricas.service';
import { UNIDADE_DE_TRABALHO, UnidadeDeTrabalho } from 'src/shared/transacao/unidade-de-trabalho';
import { HISTORICO_OS_REPOSITORY, HistoricoOSRepository } from '../domain/historico-os';
import { Compensacoes, OrdemServico } from '../domain/ordem-servico.entity';
import {
  ORDEM_SERVICO_REPOSITORY,
  OrdemServicoRepository,
} from '../domain/ordem-servico.repository';
import { StatusOS } from '../domain/status-os';
import { Comando, Evento, MotivoCancelamento } from './mensagens';
import { NOTIFICACAO_PORT, NotificacaoPort } from './notificacao.port';

type Payload = Record<string, unknown>;

interface Resultado {
  os: OrdemServico;
  statusAnterior: StatusOS;
  linkAprovacao?: string;
}

/**
 * Orquestrador da saga da ordem de serviço.
 *
 * Cada mensagem recebida é tratada numa única transação local: lê a OS com
 * bloqueio, aplica a transição, grava histórico e enfileira os próximos
 * comandos na outbox. Mensagem repetida é descartada pela inbox. Evento que
 * não faz sentido no estado atual é registrado e ignorado, exceto quando chega
 * depois de um cancelamento e exige compensação (ex.: pagamento aprovado de
 * uma OS já cancelada vira estorno).
 */
@Injectable()
export class SagaOrdemServicoService implements ManipuladorMensagem {
  private readonly logger = new Logger(SagaOrdemServicoService.name);

  constructor(
    @Inject(ORDEM_SERVICO_REPOSITORY) private readonly ordens: OrdemServicoRepository,
    @Inject(HISTORICO_OS_REPOSITORY) private readonly historico: HistoricoOSRepository,
    @Inject(PECA_REPOSITORY) private readonly pecas: PecaRepository,
    @Inject(OUTBOX) private readonly outbox: Outbox,
    @Inject(INBOX) private readonly inbox: Inbox,
    @Inject(UNIDADE_DE_TRABALHO) private readonly uow: UnidadeDeTrabalho,
    private readonly clientes: ClientesService,
    private readonly veiculos: VeiculosService,
    private readonly metricas: MetricasService,
    @Optional() @Inject(NOTIFICACAO_PORT) private readonly notificacao?: NotificacaoPort,
  ) {}

  /** Primeiro passo da saga; roda dentro da transação que cria a OS. */
  async iniciar(os: OrdemServico): Promise<void> {
    const cliente = await this.clientes.findById(os.clienteId);
    await this.historico.registrar({
      osId: os.id as string,
      evento: 'OrdemServicoAberta',
      statusAnterior: null,
      statusNovo: os.status,
      em: Date.now(),
    });
    await this.comando(Fila.BILLING, Comando.GerarOrcamento, os, {
      osNumero: os.numero,
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        email: cliente.email,
        documento: cliente.documento,
      },
      itens: os.itens.map((i) => ({
        tipo: i.tipo,
        referenciaId: i.referenciaId,
        descricao: i.descricao,
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
      })),
    });
  }

  /** Cancelamento pedido pela oficina, com as compensações do estado atual. */
  async cancelarPelaOficina(osId: string, motivo?: string): Promise<OrdemServico | null> {
    const resultado = await this.uow.executar(async () => {
      const os = await this.ordens.findByIdParaAtualizar(osId);
      if (!os) return null;
      const anterior = os.status;
      await this.cancelar(os, motivo ?? MotivoCancelamento.CANCELADA_PELA_OFICINA);
      this.metricas.transicoes.inc({ de: anterior, para: os.status });
      await this.historico.registrar({
        osId,
        evento: 'CanceladaPelaOficina',
        statusAnterior: anterior,
        statusNovo: os.status,
        detalhe: os.motivoCancelamento,
        em: Date.now(),
      });
      return { os: await this.ordens.update(os), statusAnterior: anterior };
    });
    if (resultado) await this.notificar(resultado);
    return resultado?.os ?? null;
  }

  async tratar(envelope: Envelope): Promise<void> {
    const resultado = await this.uow.executar(async () => {
      const nova = await this.inbox.registrar(envelope.messageId, envelope.type);
      if (!nova) {
        this.metricas.mensagensSaga.inc({ tipo: envelope.type, resultado: 'duplicada' });
        this.logger.warn(`Mensagem ${envelope.messageId} (${envelope.type}) já processada`);
        return null;
      }

      const payload = envelope.payload as Payload;
      const osId = (payload.osId as string | undefined) ?? envelope.correlationId;
      const os = await this.ordens.findByIdParaAtualizar(osId);
      if (!os) {
        this.metricas.mensagensSaga.inc({ tipo: envelope.type, resultado: 'os_inexistente' });
        this.logger.warn(`${envelope.type} para OS inexistente ${osId}`);
        return null;
      }

      const anterior = os.status;
      const aplicado = await this.aplicar(envelope.type, os, payload);
      this.metricas.mensagensSaga.inc({
        tipo: envelope.type,
        resultado: aplicado.ignorado ? 'ignorada' : 'aplicada',
      });

      if (os.status !== anterior) {
        this.metricas.transicoes.inc({ de: anterior, para: os.status });
      }
      await this.historico.registrar({
        osId,
        evento: envelope.type,
        statusAnterior: anterior,
        statusNovo: os.status,
        detalhe: aplicado.detalhe ?? null,
        em: Date.now(),
      });

      return {
        os: await this.ordens.update(os),
        statusAnterior: anterior,
        linkAprovacao: aplicado.linkAprovacao,
      };
    });

    if (resultado) await this.notificar(resultado);
  }

  private async aplicar(
    tipo: string,
    os: OrdemServico,
    p: Payload,
  ): Promise<{ ignorado?: boolean; detalhe?: string; linkAprovacao?: string }> {
    const s = os.status;
    const cancelada = s === StatusOS.CANCELADA;

    switch (tipo) {
      case Evento.OrcamentoGerado:
        if (s === StatusOS.RECEBIDA) {
          os.registrarOrcamento(p.orcamentoId as string, Number(p.valorTotal));
          return { linkAprovacao: p.linkAprovacao as string };
        }
        if (cancelada) {
          // A OS foi cancelada enquanto o orçamento era gerado.
          await this.comando(Fila.BILLING, Comando.CancelarOrcamento, os, {
            orcamentoId: p.orcamentoId,
            motivo: os.motivoCancelamento,
          });
          return { detalhe: 'orçamento gerado após o cancelamento; cancelamento solicitado' };
        }
        return this.ignorar(tipo, os);

      case Evento.OrcamentoAprovado:
        if (s !== StatusOS.AGUARDANDO_APROVACAO) return this.ignorar(tipo, os);
        if (await this.reservarEstoque(os)) {
          os.aprovarComEstoqueReservado();
          await this.comando(Fila.BILLING, Comando.CobrarOrcamento, os, {
            orcamentoId: os.orcamentoId,
          });
          return {};
        }
        await this.cancelar(os, MotivoCancelamento.ESTOQUE_INSUFICIENTE);
        return { detalhe: 'estoque insuficiente para as peças do orçamento' };

      case Evento.OrcamentoRecusado:
        if (s !== StatusOS.AGUARDANDO_APROVACAO) return this.ignorar(tipo, os);
        // O billing já marcou o orçamento como recusado: nada a desfazer lá.
        os.cancelar(MotivoCancelamento.ORCAMENTO_RECUSADO);
        this.metricas.compensacoes.inc({ motivo: MotivoCancelamento.ORCAMENTO_RECUSADO });
        return {};

      case Evento.PagamentoAprovado:
        if (s === StatusOS.AGUARDANDO_PAGAMENTO) {
          os.registrarPagamento(p.pagamentoId as string);
          const veiculo = await this.veiculos.findById(os.veiculoId);
          await this.comando(Fila.EXECUTION, Comando.AgendarExecucao, os, {
            osNumero: os.numero,
            veiculo: { placa: veiculo.placa, marca: veiculo.marca, modelo: veiculo.modelo },
            itens: os.itens.map((i) => ({
              tipo: i.tipo,
              descricao: i.descricao,
              quantidade: i.quantidade,
            })),
          });
          return {};
        }
        if (cancelada) {
          await this.comando(Fila.BILLING, Comando.EstornarPagamento, os, {
            pagamentoId: p.pagamentoId,
            motivo: 'pagamento recebido após o cancelamento da OS',
          });
          this.metricas.compensacoes.inc({ motivo: 'PAGAMENTO_APOS_CANCELAMENTO' });
          return { detalhe: 'pagamento após o cancelamento; estorno solicitado' };
        }
        return this.ignorar(tipo, os);

      case Evento.PagamentoRecusado:
        if (s !== StatusOS.AGUARDANDO_PAGAMENTO) return this.ignorar(tipo, os);
        await this.cancelar(os, MotivoCancelamento.PAGAMENTO_RECUSADO, {
          cancelarOrcamento: false,
        });
        return { detalhe: (p.motivo as string | undefined) ?? undefined };

      case Evento.ExecucaoAgendada:
        if (cancelada) {
          await this.comando(Fila.EXECUTION, Comando.CancelarExecucao, os, {
            motivo: os.motivoCancelamento,
          });
          return { detalhe: 'execução agendada após o cancelamento; cancelamento solicitado' };
        }
        return { detalhe: `posição na fila: ${String(p.posicaoNaFila)}` };

      case Evento.ExecucaoAtualizada:
        if (s === StatusOS.AGUARDANDO_EXECUCAO) os.iniciarExecucao(p.execucaoId as string);
        return { detalhe: [p.etapa, p.observacao].filter(Boolean).join(': ') };

      case Evento.ExecucaoFinalizada:
        if (s !== StatusOS.AGUARDANDO_EXECUCAO && s !== StatusOS.EM_EXECUCAO) {
          return this.ignorar(tipo, os);
        }
        os.finalizar(p.execucaoId as string);
        return {};

      case Evento.ExecucaoFalhou:
        if (s !== StatusOS.AGUARDANDO_EXECUCAO && s !== StatusOS.EM_EXECUCAO) {
          return this.ignorar(tipo, os);
        }
        // A execução já parou do lado de lá: não há o que cancelar.
        await this.cancelar(os, MotivoCancelamento.EXECUCAO_FALHOU, {
          cancelarExecucao: false,
        });
        return { detalhe: p.motivo as string };

      case Evento.OrcamentoCancelado:
      case Evento.PagamentoEstornado:
      case Evento.ExecucaoCancelada:
        // Confirmações de compensação: só entram no histórico.
        return {};

      default:
        return this.ignorar(tipo, os);
    }
  }

  /**
   * Cancela a OS e dispara as compensações que o estado anterior exige.
   * `sobrescrever` desliga compensações que o emissor do evento já fez.
   */
  private async cancelar(
    os: OrdemServico,
    motivo: string,
    sobrescrever: Partial<Compensacoes> = {},
  ): Promise<void> {
    const c = { ...os.cancelar(motivo), ...sobrescrever };
    this.metricas.compensacoes.inc({ motivo });

    if (c.liberarEstoque) await this.liberarEstoque(os);
    if (c.cancelarOrcamento && os.orcamentoId) {
      await this.comando(Fila.BILLING, Comando.CancelarOrcamento, os, {
        orcamentoId: os.orcamentoId,
        motivo,
      });
    }
    if (c.estornarPagamento && os.pagamentoId) {
      await this.comando(Fila.BILLING, Comando.EstornarPagamento, os, {
        pagamentoId: os.pagamentoId,
        motivo,
      });
    }
    if (c.cancelarExecucao) {
      await this.comando(Fila.EXECUTION, Comando.CancelarExecucao, os, { motivo });
    }
  }

  /** Reserva tudo ou nada: se faltar uma peça, devolve as que já tinham sido reservadas. */
  private async reservarEstoque(os: OrdemServico): Promise<boolean> {
    const reservadas: { id: string; quantidade: number }[] = [];
    for (const item of os.pecas) {
      if (!(await this.pecas.reservar(item.referenciaId, item.quantidade))) {
        for (const r of reservadas) await this.pecas.liberar(r.id, r.quantidade);
        return false;
      }
      reservadas.push({ id: item.referenciaId, quantidade: item.quantidade });
    }
    return true;
  }

  private async liberarEstoque(os: OrdemServico): Promise<void> {
    for (const item of os.pecas) await this.pecas.liberar(item.referenciaId, item.quantidade);
  }

  private async comando(fila: Fila, tipo: string, os: OrdemServico, payload: Payload) {
    await this.outbox.adicionar(
      fila,
      criarEnvelope(tipo, os.id as string, { osId: os.id, ...payload }),
    );
  }

  private ignorar(tipo: string, os: OrdemServico) {
    this.logger.warn(`${tipo} ignorado: OS ${os.numero} está em ${os.status}`);
    return { ignorado: true, detalhe: `ignorado no estado ${os.status}` };
  }

  /** E-mail ao cliente fora da transação: falha de SMTP não desfaz a saga. */
  private async notificar({ os, statusAnterior, linkAprovacao }: Resultado): Promise<void> {
    if (!this.notificacao || os.status === statusAnterior) return;
    try {
      const cliente = await this.clientes.findById(os.clienteId);
      await this.notificacao.notificarMudancaStatus(os, cliente.email, { linkAprovacao });
    } catch (err) {
      this.metricas.falhasIntegracao.inc({ integracao: 'email' });
      this.logger.warn(`Falha ao notificar a OS ${os.numero}: ${(err as Error).message}`);
    }
  }
}
