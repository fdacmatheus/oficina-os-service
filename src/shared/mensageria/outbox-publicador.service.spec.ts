import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { DataSource } from 'typeorm';
import { MetricasService } from '../observabilidade/metricas.service';
import { criarEnvelope } from './envelope';
import { OutboxPublicadorService } from './outbox-publicador.service';
import { OutboxOrmEntity } from './outbox.orm-entity';

const env: Record<string, string> = {
  SQS_BILLING_COMANDOS_URL: 'http://sqs/billing',
  SQS_EXECUTION_COMANDOS_URL: 'http://sqs/execution',
};

function linha(tipo: string, fila: string): OutboxOrmEntity {
  const corpo = criarEnvelope(tipo, 'os-1', {});
  return Object.assign(new OutboxOrmEntity(), {
    id: corpo.messageId,
    tipo,
    filaDestino: fila,
    corpo,
    correlationId: 'os-1',
    criadaEm: 1,
    publicadaEm: null,
  });
}

describe('OutboxPublicadorService', () => {
  let pendentes: OutboxOrmEntity[];
  let qb: Record<string, jest.Mock>;
  let manager: { getRepository: jest.Mock; update: jest.Mock; count: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let sqs: { send: jest.Mock };
  let metricas: MetricasService;
  let config: Record<string, string>;
  let servico: OutboxPublicadorService;

  const valor = async (metrica: { get(): Promise<{ values: { value: number }[] }> }) =>
    (await metrica.get()).values.reduce((s, v) => s + v.value, 0);

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    pendentes = [
      linha('GerarOrcamento', 'billing-comandos'),
      linha('ExecutarOS', 'execution-comandos'),
    ];
    qb = {};
    for (const m of ['where', 'orderBy', 'limit', 'setLock', 'setOnLocked']) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getMany = jest.fn(async () => pendentes);
    manager = {
      getRepository: jest.fn(() => ({ createQueryBuilder: () => qb })),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };
    dataSource = { transaction: jest.fn((fn) => fn(manager)) };
    sqs = { send: jest.fn().mockResolvedValue({}) };
    metricas = new MetricasService();
    config = { ...env };
    servico = new OutboxPublicadorService(
      dataSource as unknown as DataSource,
      { get: (k: string, d?: string) => config[k] ?? d } as unknown as ConfigService,
      metricas,
      sqs as unknown as SQSClient,
    );
  });

  afterEach(() => {
    servico.onApplicationShutdown();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('busca pendentes com lock SKIP LOCKED, na ordem de criação e com limite', async () => {
    await servico.publicarPendentes(10);
    expect(qb.where).toHaveBeenCalledWith('o.publicada_em IS NULL');
    expect(qb.orderBy).toHaveBeenCalledWith('o.criada_em', 'ASC');
    expect(qb.limit).toHaveBeenCalledWith(10);
    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(qb.setOnLocked).toHaveBeenCalledWith('skip_locked');
  });

  it('envia cada mensagem para a URL da sua fila, marca publicada_em e conta a métrica', async () => {
    manager.count.mockResolvedValue(3);
    await expect(servico.publicarPendentes()).resolves.toBe(2);

    const comandos = sqs.send.mock.calls.map(([c]) => c as SendMessageCommand);
    expect(comandos[0]).toBeInstanceOf(SendMessageCommand);
    expect(comandos.map((c) => c.input.QueueUrl)).toEqual([
      'http://sqs/billing',
      'http://sqs/execution',
    ]);
    expect(JSON.parse(comandos[0].input.MessageBody!)).toEqual(pendentes[0].corpo);
    expect(comandos[0].input.MessageAttributes).toEqual({
      type: { DataType: 'String', StringValue: 'GerarOrcamento' },
      correlationId: { DataType: 'String', StringValue: 'os-1' },
    });

    expect(manager.update).toHaveBeenCalledTimes(2);
    const [entidade, criterio, mudanca] = manager.update.mock.calls[0];
    expect(entidade).toBe(OutboxOrmEntity);
    expect(criterio).toEqual({ id: pendentes[0].id });
    expect(typeof mudanca.publicadaEm).toBe('number');

    expect(await valor(metricas.mensagensPublicadas)).toBe(2);
    expect(await valor(metricas.outboxPendentes)).toBe(3);
  });

  it('falha no SQS: não marca como publicada, não conta métrica e devolve 0', async () => {
    sqs.send.mockRejectedValue(new Error('SQS fora'));
    await expect(servico.publicarPendentes()).resolves.toBe(0);
    expect(manager.update).not.toHaveBeenCalled();
    expect(await valor(metricas.mensagensPublicadas)).toBe(0);
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('SQS fora'));
    // Libera o flag: o próximo ciclo volta a publicar.
    sqs.send.mockResolvedValue({});
    await expect(servico.publicarPendentes()).resolves.toBe(2);
  });

  it('falha no meio do lote: confirma as já enviadas e para', async () => {
    sqs.send.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('SQS caiu'));
    await expect(servico.publicarPendentes()).resolves.toBe(1);
    expect(manager.update).toHaveBeenCalledTimes(1);
    expect(await valor(metricas.mensagensPublicadas)).toBe(1);
  });

  it('falha no banco: registra o erro, devolve 0 e libera o próximo ciclo', async () => {
    dataSource.transaction.mockRejectedValueOnce(new Error('Postgres fora'));
    await expect(servico.publicarPendentes()).resolves.toBe(0);
    expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('Postgres fora'));
    await expect(servico.publicarPendentes()).resolves.toBe(2);
  });

  it('não roda dois ciclos ao mesmo tempo', async () => {
    const [a, b] = await Promise.all([servico.publicarPendentes(), servico.publicarPendentes()]);
    expect([a, b]).toEqual([2, 0]);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('bootstrap agenda ciclos no intervalo configurado e shutdown os para', () => {
    jest.useFakeTimers();
    config.OUTBOX_INTERVALO_MS = '500';
    const ciclo = jest.spyOn(servico, 'publicarPendentes').mockResolvedValue(0);
    servico.onApplicationBootstrap();
    jest.advanceTimersByTime(1000);
    expect(ciclo).toHaveBeenCalledTimes(2);
    servico.onApplicationShutdown();
    jest.advanceTimersByTime(1000);
    expect(ciclo).toHaveBeenCalledTimes(2);
  });

  it('com OUTBOX_PUBLICADOR_ENABLED=false não agenda nada', () => {
    jest.useFakeTimers();
    config.OUTBOX_PUBLICADOR_ENABLED = 'false';
    const ciclo = jest.spyOn(servico, 'publicarPendentes');
    servico.onApplicationBootstrap();
    jest.advanceTimersByTime(5000);
    expect(ciclo).not.toHaveBeenCalled();
  });
});
