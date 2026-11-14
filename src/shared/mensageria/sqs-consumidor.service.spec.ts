import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { obterCorrelationId } from '../observabilidade/correlacao.middleware';
import { criarEnvelope } from './envelope';
import { ManipuladorMensagem } from './mensageria.port';
import { SqsConsumidorService } from './sqs-consumidor.service';

const FILA = 'http://sqs/os-eventos';

describe('SqsConsumidorService', () => {
  let sqs: { send: jest.Mock };
  let manipulador: { tratar: jest.Mock };
  let config: Record<string, string>;
  let servico: SqsConsumidorService;
  let correlacaoNoTratar: string | undefined;
  let correlacaoNoErro: string | undefined;

  const mensagem = (extra: Partial<Message> = {}): Message => ({
    MessageId: 'm-1',
    ReceiptHandle: 'rh-1',
    Body: JSON.stringify(criarEnvelope('OrcamentoAprovado', 'os-42', {})),
    ...extra,
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {
      correlacaoNoErro = obterCorrelationId();
    });
    correlacaoNoTratar = correlacaoNoErro = undefined;
    sqs = { send: jest.fn().mockResolvedValue({}) };
    manipulador = {
      tratar: jest.fn(async () => {
        correlacaoNoTratar = obterCorrelationId();
      }),
    };
    config = { SQS_OS_EVENTOS_URL: FILA };
    servico = new SqsConsumidorService(
      { get: (k: string, d?: string) => config[k] ?? d } as unknown as ConfigService,
      sqs as unknown as SQSClient,
      manipulador as unknown as ManipuladorMensagem,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('processar', () => {
    it('sucesso: trata no contexto do correlationId e só então apaga a mensagem', async () => {
      await expect(servico.processar(FILA, mensagem())).resolves.toBe(true);
      expect(manipulador.tratar).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'OrcamentoAprovado', correlationId: 'os-42' }),
      );
      expect(correlacaoNoTratar).toBe('os-42');
      const [cmd] = sqs.send.mock.calls[0];
      expect(cmd).toBeInstanceOf(DeleteMessageCommand);
      expect(cmd.input).toEqual({ QueueUrl: FILA, ReceiptHandle: 'rh-1' });
    });

    it('erro no manipulador: não apaga (volta à fila / DLQ) e loga com o correlationId', async () => {
      manipulador.tratar.mockRejectedValue(new Error('banco fora'));
      await expect(servico.processar(FILA, mensagem())).resolves.toBe(false);
      expect(sqs.send).not.toHaveBeenCalled();
      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('banco fora'));
      expect(correlacaoNoErro).toBe('os-42');
    });

    it('corpo inválido usa o correlationId do atributo da mensagem', async () => {
      const msg = mensagem({
        Body: '{}',
        MessageAttributes: { correlationId: { DataType: 'String', StringValue: 'os-attr' } },
      });
      await expect(servico.processar(FILA, msg)).resolves.toBe(false);
      expect(manipulador.tratar).not.toHaveBeenCalled();
      expect(correlacaoNoErro).toBe('os-attr');
    });

    it('sem atributo cai no MessageId; sem nada fica vazio', async () => {
      await servico.processar(FILA, mensagem({ Body: undefined }));
      expect(correlacaoNoErro).toBe('m-1');
      await servico.processar(FILA, { Body: 'x' });
      expect(correlacaoNoErro).toBe('');
      expect(sqs.send).not.toHaveBeenCalled();
    });
  });

  describe('laço de consumo', () => {
    it('com SQS_CONSUMER_ENABLED=false não consome', async () => {
      config.SQS_CONSUMER_ENABLED = 'false';
      servico.onApplicationBootstrap();
      await servico.onApplicationShutdown();
      expect(sqs.send).not.toHaveBeenCalled();
    });

    it('faz long polling, processa as mensagens, sobrevive a erro de leitura e para no shutdown', async () => {
      config.SQS_WAIT_SECONDS = '5';
      jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn();
        return 0;
      }) as unknown as typeof setTimeout);
      let recebimentos = 0;
      let parada: Promise<void> | undefined;
      sqs.send.mockImplementation(async (cmd) => {
        if (!(cmd instanceof ReceiveMessageCommand)) return {};
        recebimentos++;
        if (recebimentos === 1)
          return { Messages: [mensagem(), mensagem({ ReceiptHandle: 'rh-2' })] };
        if (recebimentos === 2) throw new Error('rede');
        parada = servico.onApplicationShutdown();
        return {};
      });

      servico.onApplicationBootstrap();
      while (!parada) await new Promise((r) => setImmediate(r));
      await parada;

      const receive = sqs.send.mock.calls.find(([c]) => c instanceof ReceiveMessageCommand)![0];
      expect(receive.input).toEqual({
        QueueUrl: FILA,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 5,
        MessageAttributeNames: ['All'],
      });
      expect(manipulador.tratar).toHaveBeenCalledTimes(2);
      const apagadas = sqs.send.mock.calls
        .filter(([c]) => c instanceof DeleteMessageCommand)
        .map(([c]) => c.input.ReceiptHandle);
      expect(apagadas).toEqual(['rh-1', 'rh-2']);
      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('rede'));
      expect(recebimentos).toBe(3);
    });
  });
});
