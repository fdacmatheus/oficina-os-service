import { ColunaEpoch } from '../../../shared/database/coluna-epoch';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'clientes' })
export class ClienteOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  nome!: string;

  @Column({ type: 'varchar', length: 14, unique: true })
  documento!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  telefone!: string | null;

  @ColunaEpoch('criado_em')
  criadoEm!: number;

  @ColunaEpoch('atualizado_em')
  atualizadoEm!: number;
}
