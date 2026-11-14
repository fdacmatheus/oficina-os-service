import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { DataSource, IsNull } from 'typeorm';
import { MetricasService } from '../observabilidade/metricas.service';
import { emSpanDaMensagem, semRastreamento } from '../observabilidade/telemetria';
import { Fila } from './envelope';
import { OutboxOrmEntity } from './outbox.orm-entity';
import { SQS_CLIENT, urlDaFila } from './sqs.config';

/**
 * Publica no SQS o que foi gravado na outbox.
 *
 * `FOR UPDATE SKIP LOCKED` deixa várias réplicas publicarem em paralelo sem
 * pegar a mesma linha. Se o envio falhar, a linha continua pendente e volta no
 * próximo ciclo; se o processo cair depois do envio e antes de marcar, a
 * mensagem sai de novo e o consumidor descarta a duplicata pela inbox.
 */
@Injectable()
export class OutboxPublicadorService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxPublicadorService.name);
  private timer?: NodeJS.Timeout;
  private rodando = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly metricas: MetricasService,
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('OUTBOX_PUBLICADOR_ENABLED', 'true') !== 'true') return;
    const intervalo = Number(this.config.get<string>('OUTBOX_INTERVALO_MS', '1000'));
    this.timer = setInterval(() => void semRastreamento(() => this.publicarPendentes()), intervalo);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Um ciclo de publicação; devolve quantas mensagens saíram. */
  async publicarPendentes(limite = 50): Promise<number> {
    if (this.rodando) return 0;
    this.rodando = true;
    try {
      return await this.dataSource.transaction(async (manager) => {
        const pendentes = await manager
          .getRepository(OutboxOrmEntity)
          .createQueryBuilder('o')
          .where('o.publicada_em IS NULL')
          .orderBy('o.criada_em', 'ASC')
          .limit(limite)
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .getMany();

        let enviadas = 0;
        for (const msg of pendentes) {
          try {
            await emSpanDaMensagem(
              `publicar ${msg.tipo}`,
              'produtor',
              msg.corpo.traceparent,
              { 'messaging.destination.name': msg.filaDestino, 'oficina.os_id': msg.correlationId },
              () =>
                this.sqs.send(
                  new SendMessageCommand({
                    QueueUrl: urlDaFila(this.config, msg.filaDestino as Fila),
                    MessageBody: JSON.stringify(msg.corpo),
                    MessageAttributes: {
                      type: { DataType: 'String', StringValue: msg.tipo },
                      correlationId: { DataType: 'String', StringValue: msg.correlationId },
                    },
                  }),
                ),
            );
          } catch (err) {
            // Para no primeiro erro mas confirma o que já saiu: sem isso a
            // transação desfaria as marcações e o lote inteiro seria reenviado.
            this.logger.error(
              `Falha ao publicar ${msg.tipo} (${msg.id}): ${(err as Error).message}`,
            );
            break;
          }
          await manager.update(OutboxOrmEntity, { id: msg.id }, { publicadaEm: Date.now() });
          this.metricas.mensagensPublicadas.inc({ tipo: msg.tipo, fila: msg.filaDestino });
          this.logger.log(`${msg.tipo} publicado em ${msg.filaDestino} (OS ${msg.correlationId})`);
          enviadas += 1;
        }

        this.metricas.outboxPendentes.set(
          await manager.count(OutboxOrmEntity, { where: { publicadaEm: IsNull() } }),
        );
        return enviadas;
      });
    } catch (err) {
      this.logger.error(`Falha ao publicar a outbox: ${(err as Error).message}`);
      return 0;
    } finally {
      this.rodando = false;
    }
  }
}
