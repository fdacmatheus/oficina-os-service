import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { emSpanDaMensagem, traceparentAtual } from './telemetria';

describe('telemetria', () => {
  it('sem SDK registrado não gera traceparent e ainda roda a função', async () => {
    expect(traceparentAtual()).toBeUndefined();
    await expect(emSpanDaMensagem('x', 'produtor', undefined, {}, async () => 7)).resolves.toBe(7);
  });

  describe('com SDK', () => {
    const exportador = new InMemorySpanExporter();

    beforeAll(() => {
      const gerenciador = new AsyncLocalStorageContextManager().enable();
      context.setGlobalContextManager(gerenciador);
      propagation.setGlobalPropagator(new W3CTraceContextPropagator());
      trace.setGlobalTracerProvider(
        new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exportador)] }),
      );
    });

    afterAll(() => {
      trace.disable();
      propagation.disable();
      context.disable();
    });

    beforeEach(() => exportador.reset());

    it('o consumidor continua o trace que veio dentro da mensagem', async () => {
      let traceparent: string | undefined;
      await emSpanDaMensagem('publicar GerarOrcamento', 'produtor', undefined, {}, async () => {
        traceparent = traceparentAtual();
      });
      expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

      await emSpanDaMensagem(
        'processar GerarOrcamento',
        'consumidor',
        traceparent,
        { 'oficina.os_id': 'os-1' },
        async () => undefined,
      );

      const [produtor, consumidor] = exportador.getFinishedSpans();
      expect(consumidor.spanContext().traceId).toBe(produtor.spanContext().traceId);
      expect(consumidor.parentSpanContext?.spanId).toBe(produtor.spanContext().spanId);
      expect(consumidor.attributes['oficina.os_id']).toBe('os-1');
    });

    it('marca o span com erro e repassa a exceção', async () => {
      await expect(
        emSpanDaMensagem('processar X', 'consumidor', undefined, {}, async () => {
          throw new Error('quebrou');
        }),
      ).rejects.toThrow('quebrou');
      const [span] = exportador.getFinishedSpans();
      expect(span.status).toMatchObject({ code: 2, message: 'quebrou' });
      expect(span.events[0].name).toBe('exception');
    });
  });
});
