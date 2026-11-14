/** Tipos de mensagem da saga (ver CONTRATO-MENSAGENS.md). */
export const Comando = {
  GerarOrcamento: 'GerarOrcamento',
  CobrarOrcamento: 'CobrarOrcamento',
  CancelarOrcamento: 'CancelarOrcamento',
  EstornarPagamento: 'EstornarPagamento',
  AgendarExecucao: 'AgendarExecucao',
  CancelarExecucao: 'CancelarExecucao',
} as const;

export const Evento = {
  OrcamentoGerado: 'OrcamentoGerado',
  OrcamentoAprovado: 'OrcamentoAprovado',
  OrcamentoRecusado: 'OrcamentoRecusado',
  OrcamentoCancelado: 'OrcamentoCancelado',
  PagamentoAprovado: 'PagamentoAprovado',
  PagamentoRecusado: 'PagamentoRecusado',
  PagamentoEstornado: 'PagamentoEstornado',
  ExecucaoAgendada: 'ExecucaoAgendada',
  ExecucaoAtualizada: 'ExecucaoAtualizada',
  ExecucaoFinalizada: 'ExecucaoFinalizada',
  ExecucaoFalhou: 'ExecucaoFalhou',
  ExecucaoCancelada: 'ExecucaoCancelada',
} as const;

/** Motivos de cancelamento gravados na OS e usados como label de métrica. */
export const MotivoCancelamento = {
  ORCAMENTO_RECUSADO: 'ORCAMENTO_RECUSADO',
  ESTOQUE_INSUFICIENTE: 'ESTOQUE_INSUFICIENTE',
  PAGAMENTO_RECUSADO: 'PAGAMENTO_RECUSADO',
  EXECUCAO_FALHOU: 'EXECUCAO_FALHOU',
  CANCELADA_PELA_OFICINA: 'CANCELADA_PELA_OFICINA',
} as const;
