import { ColunaEpoch } from '../../../shared/database/coluna-epoch';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'users' })
export class UserOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 60, unique: true })
  username!: string;

  @Column({ type: 'varchar', length: 100, name: 'password_hash' })
  passwordHash!: string;

  @ColunaEpoch('criado_em')
  criadoEm!: number;

  @ColunaEpoch('atualizado_em')
  atualizadoEm!: number;
}
