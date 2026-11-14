import { join } from 'node:path';
import { defineFeature, DefineStepFunction, loadFeature } from 'jest-cucumber';
import { Comando } from '../application/mensagens';
import { StatusOS } from '../domain/status-os';
import { Cenario, montarCenario } from '../__testes__/cenario';

const feature = loadFeature(join(__dirname, 'saga-ordem-servico.feature'));

/** Payload que cada serviço externo mandaria em cada evento. */
const PAYLOADS: Record<string, Record<string, unknown>> = {
  OrcamentoGerado: {
    orcamentoId: 'orc-1',
    valorTotal: 310,
    linkAprovacao: 'http://billing/orc-1?token=t',
  },
  OrcamentoAprovado: { orcamentoId: 'orc-1' },
  OrcamentoRecusado: { orcamentoId: 'orc-1' },
  PagamentoAprovado: { orcamentoId: 'orc-1', pagamentoId: 'pag-1', valor: 310 },
  PagamentoRecusado: {
    orcamentoId: 'orc-1',
    pagamentoId: 'pag-1',
    motivo: 'cc_rejected_insufficient_amount',
  },
  ExecucaoAtualizada: { execucaoId: 'exe-1', etapa: 'EM_DIAGNOSTICO' },
  ExecucaoFinalizada: { execucaoId: 'exe-1' },
  ExecucaoFalhou: { execucaoId: 'exe-1', motivo: 'Elevador hidráulico quebrou' },
};

const COMPENSACOES = [
  Comando.CancelarOrcamento,
  Comando.EstornarPagamento,
  Comando.CancelarExecucao,
] as string[];

defineFeature(feature, (test) => {
  let c: Cenario;
  let osId: string;
  let estoqueInicial: number;

  // Passos compartilhados entre os cenários (registrados por texto).
  const contexto = (given: DefineStepFunction, and: DefineStepFunction) => {
    given(/^que o estoque tem (\d+) unidades da peça "(.*)"$/, (qtd: string, peca: string) => {
      estoqueInicial = Number(qtd);
      c = montarCenario({ [peca]: estoqueInicial });
    });
    and(/^uma OS aberta com (\d+) unidades da peça "(.*)"$/, async (qtd: string, peca: string) => {
      osId = await c.abrirOS([{ id: peca, quantidade: Number(qtd) }]);
    });
  };

  const publica = (step: DefineStepFunction) =>
    step(/^o (billing|execution) publica "(.*)"$/, async (_servico: string, evento: string) => {
      await c.receber(evento, osId, PAYLOADS[evento]);
    });

  const ficaEm = (step: DefineStepFunction) =>
    step(/^a OS fica em "(.*)"$/, async (status: string) => {
      expect(await c.status(osId)).toBe(status);
    });

  const ficaCanceladaCom = (step: DefineStepFunction) =>
    step(/^a OS fica em "(.*)" com motivo "(.*)"$/, async (status: string, motivo: string) => {
      const os = await c.ordens.findById(osId);
      expect(os!.status).toBe(status);
      expect(os!.motivoCancelamento).toBe(motivo);
    });

  const recebeComando = (step: DefineStepFunction) =>
    step(/^o (billing|execution) recebe o comando "(.*)"$/, (servico: string, comando: string) => {
      const msg = c.outbox.mensagens.find((m) => m.envelope.type === comando);
      expect(msg).toBeDefined();
      expect(msg!.fila).toBe(`${servico}-comandos`);
      expect(msg!.envelope.correlationId).toBe(osId);
    });

  const estoqueFica = (step: DefineStepFunction) =>
    step(/^o estoque da peça "(.*)" fica com (\d+) unidades$/, (peca: string, qtd: string) => {
      expect(c.estoque.saldo[peca]).toBe(Number(qtd));
    });

  const osEsta = (step: DefineStepFunction) =>
    step(/^que a OS está em "(.*)"$/, async (status: string) => {
      await c.ate(osId, status as StatusOS);
      c.outbox.limpar();
    });

  const oficinaCancela = (step: DefineStepFunction) =>
    step('a oficina cancela a OS', async () => {
      await c.saga.cancelarPelaOficina(osId);
    });

  const semCompensacao = (step: DefineStepFunction) =>
    step('nenhum comando de compensação é enviado', () => {
      expect(c.outbox.tipos().filter((t) => COMPENSACOES.includes(t))).toEqual([]);
    });

  test('Caminho feliz da abertura à finalização', ({ given, and, when, then }) => {
    contexto(given, and);
    recebeComando(then);
    publica(when);
    ficaEm(then);
    and('o cliente recebe por e-mail o link de aprovação', () => {
      expect(c.notificacao.notificarMudancaStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: StatusOS.AGUARDANDO_APROVACAO }),
        'joao@exemplo.com',
        { linkAprovacao: 'http://billing/orc-1?token=t' },
      );
    });
    publica(when);
    ficaEm(then);
    estoqueFica(and);
    recebeComando(and);
    publica(when);
    ficaEm(then);
    recebeComando(and);
    publica(when);
    ficaEm(then);
    publica(when);
    ficaEm(then);
    and(/^o histórico da OS tem (\d+) eventos$/, async (qtd: string) => {
      expect(await c.historico.listar(osId)).toHaveLength(Number(qtd));
    });
  });

  test('Cliente recusa o orçamento', ({ given, and, when, then }) => {
    contexto(given, and);
    osEsta(given);
    publica(when);
    ficaCanceladaCom(then);
    estoqueFica(and);
    semCompensacao(and);
  });

  test('Falta peça no estoque quando o orçamento é aprovado', ({ given, and, when, then }) => {
    contexto(given, and);
    given(
      /^que o estoque da peça "(.*)" caiu para (\d+) unidades$/,
      (peca: string, qtd: string) => {
        c.estoque.saldo[peca] = Number(qtd);
      },
    );
    osEsta(and);
    publica(when);
    ficaCanceladaCom(then);
    estoqueFica(and);
    recebeComando(and);
  });

  test('Pagamento recusado devolve as peças ao estoque', ({ given, and, when, then }) => {
    contexto(given, and);
    osEsta(given);
    publica(when);
    ficaCanceladaCom(then);
    estoqueFica(and);
    semCompensacao(and);
  });

  test('Falha na execução estorna o pagamento e devolve as peças', ({ given, and, when, then }) => {
    contexto(given, and);
    osEsta(given);
    publica(when);
    ficaCanceladaCom(then);
    estoqueFica(and);
    recebeComando(and);
  });

  test('Oficina cancela uma OS já paga', ({ given, and, when, then }) => {
    contexto(given, and);
    osEsta(given);
    oficinaCancela(when);
    ficaCanceladaCom(then);
    estoqueFica(and);
    recebeComando(and);
    recebeComando(and);
  });

  test('Pagamento confirmado depois do cancelamento é estornado', ({ given, and, when, then }) => {
    contexto(given, and);
    osEsta(given);
    oficinaCancela(and);
    when(/^o billing publica "(.*)"$/, async (evento: string) => {
      c.outbox.limpar();
      await c.receber(evento, osId, PAYLOADS[evento]);
    });
    ficaCanceladaCom(then);
    recebeComando(and);
  });

  test('Mensagem entregue duas vezes pelo SQS é aplicada uma vez só', ({
    given,
    and,
    when,
    then,
  }) => {
    contexto(given, and);
    osEsta(given);
    when(/^o billing publica "(.*)" duas vezes com o mesmo id$/, async (evento: string) => {
      const msg = c.envelope(evento, osId, PAYLOADS[evento]);
      await c.saga.tratar(msg);
      await c.saga.tratar({ ...msg });
    });
    estoqueFica(then);
    and(/^o billing recebe o comando "(.*)" uma única vez$/, (comando: string) => {
      expect(c.outbox.tipos().filter((t) => t === comando)).toHaveLength(1);
    });
  });
});
