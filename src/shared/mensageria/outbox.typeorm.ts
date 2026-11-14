import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { repositorio } from '../transacao/typeorm-unidade-de-trabalho';
import { Envelope, Fila } from './envelope';
import { Inbox, Outbox } from './mensageria.port';
import { MensagemProcessadaOrmEntity } from './mensagem-processada.orm-entity';
import { OutboxOrmEntity } from './outbox.orm-entity';

@Injectable()
export class OutboxTypeOrm implements Outbox {
  constructor(private readonly dataSource: DataSource) {}

  async adicionar(fila: Fila, envelope: Envelope<unknown>): Promise<void> {
    const linha: Partial<OutboxOrmEntity> = {
      id: envelope.messageId,
      tipo: envelope.type,
      filaDestino: fila,
      corpo: envelope as Envelope<Record<string, unknown>>,
      correlationId: envelope.correlationId,
      criadaEm: Date.now(),
      publicadaEm: null,
    };
    // O tipo de insert do TypeORM não aceita `unknown` dentro de colunas jsonb.
    await repositorio(this.dataSource, OutboxOrmEntity).insert(
      linha as QueryDeepPartialEntity<OutboxOrmEntity>,
    );
  }
}

@Injectable()
export class InboxTypeOrm implements Inbox {
  constructor(private readonly dataSource: DataSource) {}

  async registrar(messageId: string, tipo: string): Promise<boolean> {
    const resultado = await repositorio(this.dataSource, MensagemProcessadaOrmEntity)
      .createQueryBuilder()
      .insert()
      .values({ messageId, tipo, processadaEm: Date.now() })
      .orIgnore()
      // Sem RETURNING explícito o TypeORM não devolve linha (a PK não é gerada),
      // e toda mensagem pareceria duplicada.
      .returning('message_id')
      .execute();
    return (resultado.raw as unknown[]).length > 0;
  }
}
