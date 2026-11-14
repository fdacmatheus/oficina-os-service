import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmUnidadeDeTrabalho } from '../transacao/typeorm-unidade-de-trabalho';
import { UNIDADE_DE_TRABALHO } from '../transacao/unidade-de-trabalho';
import { INBOX, OUTBOX } from './mensageria.port';
import { MensagemProcessadaOrmEntity } from './mensagem-processada.orm-entity';
import { OutboxPublicadorService } from './outbox-publicador.service';
import { OutboxOrmEntity } from './outbox.orm-entity';
import { InboxTypeOrm, OutboxTypeOrm } from './outbox.typeorm';
import { criarSqsClient, SQS_CLIENT } from './sqs.config';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([OutboxOrmEntity, MensagemProcessadaOrmEntity])],
  providers: [
    { provide: SQS_CLIENT, useFactory: criarSqsClient, inject: [ConfigService] },
    { provide: OUTBOX, useClass: OutboxTypeOrm },
    { provide: INBOX, useClass: InboxTypeOrm },
    { provide: UNIDADE_DE_TRABALHO, useClass: TypeOrmUnidadeDeTrabalho },
    OutboxPublicadorService,
  ],
  exports: [SQS_CLIENT, OUTBOX, INBOX, UNIDADE_DE_TRABALHO],
})
export class MensageriaModule {}
