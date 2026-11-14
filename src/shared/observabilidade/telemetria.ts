import { context, propagation, ROOT_CONTEXT, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';

const tracer = trace.getTracer('oficina');

/**
 * Contexto do trace atual no formato W3C (`traceparent`), para viajar dentro
 * do envelope da mensagem. É o que costura uma OS num único trace, mesmo com a
 * outbox publicando depois e em outro processo.
 */
export function traceparentAtual(): string | undefined {
  const portador: Record<string, string> = {};
  propagation.inject(context.active(), portador);
  return portador.traceparent;
}

/** Roda `fn` num span filho do trace que veio na mensagem (ou num trace novo). */
export function emSpanDaMensagem<T>(
  nome: string,
  tipo: 'produtor' | 'consumidor',
  traceparent: string | undefined,
  atributos: Record<string, string>,
  fn: () => Promise<T>,
): Promise<T> {
  // Parte da raiz, não do contexto ativo: o pai é só o que veio na mensagem
  // (e o polling em volta pode estar com o rastreamento suprimido).
  const pai = propagation.extract(ROOT_CONTEXT, traceparent ? { traceparent } : {});
  const kind = tipo === 'produtor' ? SpanKind.PRODUCER : SpanKind.CONSUMER;
  return tracer.startActiveSpan(nome, { kind, attributes: atributos }, pai, async (span) => {
    try {
      return await fn();
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Roda `fn` sem gerar spans. Usado no polling (outbox a cada segundo, long poll
 * do SQS), que de outro modo viraria um trace solto por consulta e esconderia
 * os traces da saga no Tempo.
 */
export function semRastreamento<T>(fn: () => Promise<T>): Promise<T> {
  return context.with(suppressTracing(context.active()), fn);
}
