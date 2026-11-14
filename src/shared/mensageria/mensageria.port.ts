import { Envelope, Fila } from './envelope';

export const OUTBOX = Symbol('OUTBOX');
export const INBOX = Symbol('INBOX');

/** Grava a mensagem para publicação posterior, na transação em curso. */
export interface Outbox {
  adicionar(fila: Fila, envelope: Envelope<unknown>): Promise<void>;
}

/**
 * Registra que a mensagem foi processada, na transação em curso.
 * Devolve `false` se ela já tinha sido processada (entrega duplicada do SQS).
 */
export interface Inbox {
  registrar(messageId: string, tipo: string): Promise<boolean>;
}

/** Quem trata as mensagens que chegam na fila de entrada do serviço. */
export const MANIPULADOR_MENSAGEM = Symbol('MANIPULADOR_MENSAGEM');

export interface ManipuladorMensagem {
  tratar(envelope: Envelope): Promise<void>;
}
