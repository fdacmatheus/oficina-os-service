export enum StatusOS {
  RECEBIDA = 'RECEBIDA',
  AGUARDANDO_APROVACAO = 'AGUARDANDO_APROVACAO',
  AGUARDANDO_PAGAMENTO = 'AGUARDANDO_PAGAMENTO',
  AGUARDANDO_EXECUCAO = 'AGUARDANDO_EXECUCAO',
  EM_EXECUCAO = 'EM_EXECUCAO',
  FINALIZADA = 'FINALIZADA',
  ENTREGUE = 'ENTREGUE',
  CANCELADA = 'CANCELADA',
}

const TRANSICOES_VALIDAS: Record<StatusOS, StatusOS[]> = {
  [StatusOS.RECEBIDA]: [StatusOS.AGUARDANDO_APROVACAO, StatusOS.CANCELADA],
  [StatusOS.AGUARDANDO_APROVACAO]: [StatusOS.AGUARDANDO_PAGAMENTO, StatusOS.CANCELADA],
  [StatusOS.AGUARDANDO_PAGAMENTO]: [StatusOS.AGUARDANDO_EXECUCAO, StatusOS.CANCELADA],
  // O SQS padrão não garante ordem: "finalizada" pode chegar antes de "iniciada".
  [StatusOS.AGUARDANDO_EXECUCAO]: [StatusOS.EM_EXECUCAO, StatusOS.FINALIZADA, StatusOS.CANCELADA],
  [StatusOS.EM_EXECUCAO]: [StatusOS.FINALIZADA, StatusOS.CANCELADA],
  [StatusOS.FINALIZADA]: [StatusOS.ENTREGUE],
  [StatusOS.ENTREGUE]: [],
  [StatusOS.CANCELADA]: [],
};

export function podeTransitar(de: StatusOS, para: StatusOS): boolean {
  return TRANSICOES_VALIDAS[de].includes(para);
}

export function transicoesPermitidas(de: StatusOS): StatusOS[] {
  return [...TRANSICOES_VALIDAS[de]];
}

export const STATUS_OCULTOS_NA_LISTAGEM: StatusOS[] = [
  StatusOS.FINALIZADA,
  StatusOS.ENTREGUE,
  StatusOS.CANCELADA,
];

const PRIORIDADE_LISTAGEM: Partial<Record<StatusOS, number>> = {
  [StatusOS.EM_EXECUCAO]: 0,
  [StatusOS.AGUARDANDO_EXECUCAO]: 1,
  [StatusOS.AGUARDANDO_PAGAMENTO]: 2,
  [StatusOS.AGUARDANDO_APROVACAO]: 3,
  [StatusOS.RECEBIDA]: 4,
};

export function prioridadeListagem(status: StatusOS): number {
  return PRIORIDADE_LISTAGEM[status] ?? Number.MAX_SAFE_INTEGER;
}
