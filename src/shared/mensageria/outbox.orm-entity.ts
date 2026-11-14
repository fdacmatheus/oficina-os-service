import { ColunaEpoch } from '../database/coluna-epoch';
import { Envelope } from './envelope';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity({ name: 'outbox' })
@Index('idx_outbox_pendentes', ['criadaEm'], { where: 'publicada_em IS NULL' })
export class OutboxOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 60 })
  tipo!: string;

  @Column({ type: 'varchar', length: 60, name: 'fila_destino' })
  filaDestino!: string;

  @Column({ type: 'jsonb' })
  corpo!: Envelope<Record<string, unknown>>;

  @Column({ type: 'varchar', length: 60, name: 'correlation_id' })
  correlationId!: string;

  @ColunaEpoch('criada_em')
  criadaEm!: number;

  @ColunaEpoch('publicada_em', { nullable: true })
  publicadaEm!: number | null;
}
