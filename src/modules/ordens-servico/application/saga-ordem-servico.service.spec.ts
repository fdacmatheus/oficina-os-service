import { SagaOrdemServicoService } from './saga-ordem-servico.service';
import { StatusOS } from '../domain/status-os';
import { montarCenario } from '../__testes__/cenario';
import { valorContador } from '../__testes__/fakes';
import { PecaRepository } from 'src/modules/pecas/domain/peca.repository';

describe('SagaOrdemServicoService', () => {
  it('ao iniciar registra a abertura e envia GerarOrcamento com cliente e itens', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    const msg = c.outbox.ultima('GerarOrcamento')!;
    expect(msg.correlationId).toBe(osId);
    expect(msg.payload).toMatchObject({
      osId,
      osNumero: 1,
      cliente: { nome: 'João da Silva', email: 'joao@exemplo.com', documento: '52998224725' },
    });
    expect((msg.payload.itens as unknown[]).length).toBe(2);
    expect((await c.historico.listar(osId))[0]).toMatchObject({
      evento: 'OrdemServicoAberta',
      statusAnterior: null,
      statusNovo: StatusOS.RECEBIDA,
    });
  });

  it('ignora (e confirma) mensagem de OS inexistente', async () => {
    const c = montarCenario();
    await c.receber('OrcamentoGerado', 'nao-existe', { orcamentoId: 'x', valorTotal: 1 });
    expect(
      await valorContador(c.metricas, 'oficina_saga_mensagens_total', {
        resultado: 'os_inexistente',
      }),
    ).toBe(1);
  });

  it('usa o correlationId quando o payload não traz osId', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    await c.saga.tratar({
      ...c.envelope('OrcamentoGerado', osId, { orcamentoId: 'o', valorTotal: 10 }),
      payload: { orcamentoId: 'o', valorTotal: 10 },
    });
    expect(await c.status(osId)).toBe(StatusOS.AGUARDANDO_APROVACAO);
  });

  it.each([
    ['OrcamentoAprovado', StatusOS.RECEBIDA],
    ['OrcamentoRecusado', StatusOS.RECEBIDA],
    ['PagamentoAprovado', StatusOS.RECEBIDA],
    ['PagamentoRecusado', StatusOS.AGUARDANDO_APROVACAO],
    ['ExecucaoFinalizada', StatusOS.AGUARDANDO_PAGAMENTO],
    ['ExecucaoFalhou', StatusOS.AGUARDANDO_PAGAMENTO],
    ['OrcamentoGerado', StatusOS.AGUARDANDO_APROVACAO],
    ['TipoDesconhecido', StatusOS.RECEBIDA],
  ])('ignora %s quando a OS está em %s, registrando no histórico', async (tipo, estado) => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    await c.ate(osId, estado);
    c.outbox.limpar();
    await c.receber(tipo, osId, {
      orcamentoId: 'orc-2',
      valorTotal: 1,
      pagamentoId: 'p',
      execucaoId: 'e',
    });
    expect(await c.status(osId)).toBe(estado);
    expect(c.outbox.mensagens).toHaveLength(0);
    const ultima = (await c.historico.listar(osId)).at(-1)!;
    expect(ultima).toMatchObject({ evento: tipo, detalhe: `ignorado no estado ${estado}` });
    expect(
      await valorContador(c.metricas, 'oficina_saga_mensagens_total', {
        tipo,
        resultado: 'ignorada',
      }),
    ).toBe(1);
  });

  it('cancela o orçamento que chega depois de a OS ter sido cancelada', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    await c.saga.cancelarPelaOficina(osId, 'cliente desistiu');
    await c.receber('OrcamentoGerado', osId, { orcamentoId: 'orc-9', valorTotal: 10 });
    expect(c.outbox.ultima('CancelarOrcamento')!.payload).toMatchObject({
      orcamentoId: 'orc-9',
      motivo: 'cliente desistiu',
    });
  });

  it('cancela a execução agendada depois de a OS ter sido cancelada', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    await c.ate(osId, StatusOS.AGUARDANDO_EXECUCAO);
    await c.saga.cancelarPelaOficina(osId);
    c.outbox.limpar();
    await c.receber('ExecucaoAgendada', osId, { execucaoId: 'e', posicaoNaFila: 1 });
    expect(c.outbox.tipos()).toEqual(['CancelarExecucao']);
  });

  it('registra a posição na fila quando a execução é agendada', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    await c.ate(osId, StatusOS.AGUARDANDO_EXECUCAO);
    await c.receber('ExecucaoAgendada', osId, { execucaoId: 'e', posicaoNaFila: 3 });
    expect((await c.historico.listar(osId)).at(-1)!.detalhe).toBe('posição na fila: 3');
  });

  it('atualizações seguintes da execução só entram no histórico', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    await c.ate(osId, StatusOS.EM_EXECUCAO);
    await c.receber('ExecucaoAtualizada', osId, {
      execucaoId: 'exe-1',
      etapa: 'EM_REPARO',
      observacao: 'trocando filtro',
    });
    expect(await c.status(osId)).toBe(StatusOS.EM_EXECUCAO);
    expect((await c.historico.listar(osId)).at(-1)!.detalhe).toBe('EM_REPARO: trocando filtro');
  });

  it('aceita a finalização antes da primeira atualização (SQS fora de ordem)', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    await c.ate(osId, StatusOS.AGUARDANDO_EXECUCAO);
    await c.receber('ExecucaoFinalizada', osId, { execucaoId: 'exe-1' });
    const os = await c.ordens.findById(osId);
    expect(os!.status).toBe(StatusOS.FINALIZADA);
    expect(os!.execucaoIniciadaEm).not.toBeNull();
  });

  it.each(['OrcamentoCancelado', 'PagamentoEstornado', 'ExecucaoCancelada'])(
    '%s só confirma a compensação no histórico',
    async (tipo) => {
      const c = montarCenario();
      const osId = await c.abrirOS();
      await c.saga.cancelarPelaOficina(osId);
      c.outbox.limpar();
      await c.receber(tipo, osId, {});
      expect(c.outbox.mensagens).toHaveLength(0);
      expect((await c.historico.listar(osId)).at(-1)!.evento).toBe(tipo);
    },
  );

  it('reserva tudo ou nada: devolve as peças já reservadas quando a segunda falta', async () => {
    const c = montarCenario({ 'peca-a': 5, 'peca-b': 1 });
    const osId = await c.abrirOS([
      { id: 'peca-a', quantidade: 3 },
      { id: 'peca-b', quantidade: 2 },
    ]);
    await c.ate(osId, StatusOS.AGUARDANDO_APROVACAO);
    await c.receber('OrcamentoAprovado', osId, { orcamentoId: 'orc-1' });
    expect(c.estoque.saldo).toEqual({ 'peca-a': 5, 'peca-b': 1 });
    expect(await c.status(osId)).toBe(StatusOS.CANCELADA);
  });

  it('OS só com serviços não reserva nem libera estoque', async () => {
    const c = montarCenario({});
    const osId = await c.abrirOS([]);
    await c.ate(osId, StatusOS.AGUARDANDO_EXECUCAO);
    expect((await c.ordens.findById(osId))!.estoqueReservado).toBe(false);
    await c.saga.cancelarPelaOficina(osId);
    expect(c.estoque.saldo).toEqual({});
  });

  it('cancelarPelaOficina devolve null para OS inexistente', async () => {
    const c = montarCenario();
    expect(await c.saga.cancelarPelaOficina('nao-existe')).toBeNull();
    expect(c.notificacao.notificarMudancaStatus).not.toHaveBeenCalled();
  });

  it('cancelarPelaOficina propaga erro de transição inválida', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    await c.ate(osId, StatusOS.FINALIZADA);
    await expect(c.saga.cancelarPelaOficina(osId)).rejects.toThrow('Transição inválida');
  });

  it('falha no e-mail não desfaz a transição e conta como falha de integração', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    c.notificacao.notificarMudancaStatus.mockRejectedValueOnce(new Error('SMTP fora'));
    await c.ate(osId, StatusOS.AGUARDANDO_APROVACAO);
    expect(await c.status(osId)).toBe(StatusOS.AGUARDANDO_APROVACAO);
    expect(
      await valorContador(c.metricas, 'oficina_integracao_falhas_total', { integracao: 'email' }),
    ).toBe(1);
  });

  it('não notifica quando o status não muda', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    await c.receber('OrcamentoCancelado', osId, {});
    expect(c.notificacao.notificarMudancaStatus).not.toHaveBeenCalled();
  });

  it('funciona sem adaptador de notificação', async () => {
    const c = montarCenario();
    const semNotificacao = new SagaOrdemServicoService(
      c.ordens,
      c.historico,
      c.estoque as unknown as PecaRepository,
      c.outbox,
      c.inbox,
      { executar: (fn) => fn() },
      c.clientes as never,
      c.veiculos as never,
      c.metricas,
    );
    const osId = await c.abrirOS();
    await semNotificacao.tratar(
      c.envelope('OrcamentoGerado', osId, { orcamentoId: 'o', valorTotal: 1 }),
    );
    expect(await c.status(osId)).toBe(StatusOS.AGUARDANDO_APROVACAO);
  });

  it('conta transições e compensações nas métricas', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    await c.ate(osId, StatusOS.AGUARDANDO_APROVACAO);
    await c.receber('OrcamentoRecusado', osId, { orcamentoId: 'orc-1' });
    expect(
      await valorContador(c.metricas, 'oficina_saga_compensacoes_total', {
        motivo: 'ORCAMENTO_RECUSADO',
      }),
    ).toBe(1);
    expect(
      await valorContador(c.metricas, 'oficina_ordem_servico_transicoes_total', {
        de: 'AGUARDANDO_APROVACAO',
        para: 'CANCELADA',
      }),
    ).toBe(1);
  });

  it('pagamento recusado sem motivo não grava detalhe', async () => {
    const c = montarCenario();
    const osId = await c.abrirOS();
    await c.ate(osId, StatusOS.AGUARDANDO_PAGAMENTO);
    await c.receber('PagamentoRecusado', osId, { pagamentoId: 'p' });
    expect((await c.historico.listar(osId)).at(-1)!.detalhe).toBeNull();
  });
});
