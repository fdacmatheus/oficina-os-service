import { ConfigService } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';
import { Fila } from './envelope';
import { criarSqsClient, urlDaFila } from './sqs.config';

const config = (env: Record<string, string>) =>
  ({ get: (k: string, d?: string) => env[k] ?? d }) as unknown as ConfigService;

describe('sqs.config', () => {
  it('criarSqsClient usa AWS_REGION ou us-east-1', async () => {
    const padrao = criarSqsClient(config({}));
    expect(padrao).toBeInstanceOf(SQSClient);
    await expect(padrao.config.region()).resolves.toBe('us-east-1');
    await expect(criarSqsClient(config({ AWS_REGION: 'sa-east-1' })).config.region()).resolves.toBe(
      'sa-east-1',
    );
  });

  it.each([
    [Fila.BILLING, 'SQS_BILLING_COMANDOS_URL'],
    [Fila.EXECUTION, 'SQS_EXECUTION_COMANDOS_URL'],
    ['os-eventos' as const, 'SQS_OS_EVENTOS_URL'],
  ])('urlDaFila(%s) lê %s', (fila, variavel) => {
    expect(urlDaFila(config({ [variavel]: `http://fila/${fila}` }), fila)).toBe(
      `http://fila/${fila}`,
    );
  });

  it('urlDaFila falha com mensagem clara se a variável não estiver configurada', () => {
    expect(() => urlDaFila(config({}), Fila.BILLING)).toThrow(
      'SQS_BILLING_COMANDOS_URL não configurada',
    );
  });
});
