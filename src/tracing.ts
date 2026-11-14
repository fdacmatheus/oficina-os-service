import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';

/**
 * Liga traces e logs OpenTelemetry (OTLP) quando há um coletor configurado.
 * Precisa ser importado antes de tudo no main.ts, para instrumentar http,
 * express, pg e aws-sdk no carregamento. Sem OTEL_EXPORTER_OTLP_ENDPOINT
 * (testes, CI) não faz nada.
 */
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  process.env.OTEL_SERVICE_NAME ??= 'os-service';
  // Métricas continuam no prom-client (/api/metrics), raspadas pelo Prometheus.
  process.env.OTEL_METRICS_EXPORTER ??= 'none';

  const sdk = new NodeSDK({
    // Explícito: a configuração automática por variável de ambiente não liga os logs.
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  });
  sdk.start();
  process.once('SIGTERM', () => void sdk.shutdown());
}
