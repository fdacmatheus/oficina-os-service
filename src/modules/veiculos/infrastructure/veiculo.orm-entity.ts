import { ColunaEpoch } from '../../../shared/database/coluna-epoch';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'veiculos' })
@Index(['clienteId'])
export class VeiculoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'cliente_id' })
  clienteId!: string;

  @Column({ type: 'varchar', length: 8, unique: true })
  placa!: string;

  @Column({ type: 'varchar', length: 40 })
  marca!: string;

  @Column({ type: 'varchar', length: 60 })
  modelo!: string;

  @Column({ type: 'int' })
  ano!: number;

  @ColunaEpoch('criado_em')
  criadoEm!: number;

  @ColunaEpoch('atualizado_em')
  atualizadoEm!: number;
}
