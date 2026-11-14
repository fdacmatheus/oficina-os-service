import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { contextoRequisicao } from '../observabilidade/correlacao.middleware';
import { emSpanDaMensagem, semRastreamento } from '../observabilidade/telemetria';
import { lerEnvelope } from './envelope';
import { MANIPULADOR_MENSAGEM, ManipuladorMensagem } from './mensageria.port';
import { SQS_CLIENT, urlDaFila } from './sqs.config';

/**
 * Lê a fila de entrada do serviço (`os-eventos`) com long polling.
 *
 * A mensagem só é apagada depois de tratada com sucesso. Em caso de erro ela
 * volta a ficar visível após o visibility timeout e, depois de 5 tentativas,
 * o SQS a move para a DLQ.
 */
@Injectable()
export class SqsConsumidorService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SqsConsumidorService.name);
  private ativo = false;
  private laco?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
    @Inject(MANIPULADOR_MENSAGEM) private readonly manipulador: ManipuladorMensagem,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('SQS_CONSUMER_ENABLED', 'true') !== 'true') return;
    this.ativo = true;
    this.laco = semRastreamento(() => this.consumir());
  }

  async onApplicationShutdown(): Promise<void> {
    this.ativo = false;
    await this.laco;
  }

  private async consumir(): Promise<void> {
    const fila = urlDaFila(this.config, 'os-eventos');
    const espera = Number(this.config.get<string>('SQS_WAIT_SECONDS', '20'));
    this.logger.log(`Consumindo ${fila}`);
    while (this.ativo) {
      try {
        const { Messages = [] } = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: fila,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: espera,
            MessageAttributeNames: ['All'],
          }),
        );
        for (const msg of Messages) await this.processar(fila, msg);
      } catch (err) {
        this.logger.error(`Falha ao ler ${fila}: ${(err as Error).message}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  async processar(fila: string, msg: Message): Promise<boolean> {
    let correlationId = msg.MessageAttributes?.correlationId?.StringValue ?? msg.MessageId ?? '';
    try {
      const envelope = lerEnvelope(msg.Body ?? '');
      correlationId = envelope.correlationId;
      await contextoRequisicao.run({ correlationId }, () =>
        emSpanDaMensagem(
          `processar ${envelope.type}`,
          'consumidor',
          envelope.traceparent,
          { 'messaging.source.name': 'os-eventos', 'oficina.os_id': correlationId },
          () => this.manipulador.tratar(envelope),
        ),
      );
      await this.sqs.send(
        new DeleteMessageCommand({ QueueUrl: fila, ReceiptHandle: msg.ReceiptHandle }),
      );
      return true;
    } catch (err) {
      contextoRequisicao.run({ correlationId }, () =>
        this.logger.error(`Falha ao tratar mensagem ${msg.MessageId}: ${(err as Error).message}`),
      );
      return false;
    }
  }
}
