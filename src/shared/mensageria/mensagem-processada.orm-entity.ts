import { ColunaEpoch } from '../database/coluna-epoch';
import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'mensagens_processadas' })
export class MensagemProcessadaOrmEntity {
  @PrimaryColumn('uuid', { name: 'message_id' })
  messageId!: string;

  @Column({ type: 'varchar', length: 60 })
  tipo!: string;

  @ColunaEpoch('processada_em')
  processadaEm!: number;
}
