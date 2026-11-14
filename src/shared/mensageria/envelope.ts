import { randomUUID } from 'node:crypto';
import { traceparentAtual } from '../observabilidade/telemetria';

/** Formato de toda mensagem trocada entre os serviços (ver CONTRATO-MENSAGENS.md). */
export interface Envelope<P = Record<string, unknown>> {
  messageId: string;
  type: string;
  correlationId: string;
  occurredAt: number;
  source: string;
  payload: P;
  /** Contexto W3C do trace de origem; opcional para quem não usa tracing. */
  traceparent?: string;
}

export const ORIGEM = 'os-service';

export function criarEnvelope<P>(type: string, correlationId: string, payload: P): Envelope<P> {
  return {
    messageId: randomUUID(),
    type,
    correlationId,
    occurredAt: Date.now(),
    source: ORIGEM,
    payload,
    traceparent: traceparentAtual(),
  };
}

export function lerEnvelope(corpo: string): Envelope {
  const dado = JSON.parse(corpo) as Partial<Envelope>;
  if (
    !dado.messageId ||
    !dado.type ||
    !dado.correlationId ||
    typeof dado.payload !== 'object' ||
    dado.payload === null
  ) {
    throw new Error('Mensagem fora do formato do envelope');
  }
  return dado as Envelope;
}

/** Filas lógicas; a URL real de cada uma vem do ambiente. */
export enum Fila {
  BILLING = 'billing-comandos',
  EXECUTION = 'execution-comandos',
}
