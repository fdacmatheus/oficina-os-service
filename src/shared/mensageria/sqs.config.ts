import { ConfigService } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';
import { Fila } from './envelope';

export const SQS_CLIENT = Symbol('SQS_CLIENT');

/** O endpoint vem de AWS_ENDPOINT_URL (Floci no local); na AWS fica vazio. */
export function criarSqsClient(config: ConfigService): SQSClient {
  return new SQSClient({ region: config.get<string>('AWS_REGION', 'us-east-1') });
}

export function urlDaFila(config: ConfigService, fila: Fila | 'os-eventos'): string {
  const variavel = {
    [Fila.BILLING]: 'SQS_BILLING_COMANDOS_URL',
    [Fila.EXECUTION]: 'SQS_EXECUTION_COMANDOS_URL',
    'os-eventos': 'SQS_OS_EVENTOS_URL',
  }[fila];
  const url = config.get<string>(variavel);
  if (!url) throw new Error(`${variavel} não configurada`);
  return url;
}
