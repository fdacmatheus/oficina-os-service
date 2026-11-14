import { ColunaEpoch } from '../../../shared/database/coluna-epoch';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'pecas' })
export class PecaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40, unique: true })
  sku!: string;

  @Column({ type: 'varchar', length: 120 })
  nome!: string;

  @Column({ type: 'text', nullable: true })
  descricao!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'preco_unitario' })
  precoUnitario!: string;

  @Column({ type: 'int', default: 0 })
  estoque!: number;

  @Column({ type: 'int', default: 0, name: 'estoque_minimo' })
  estoqueMinimo!: number;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @ColunaEpoch('criado_em')
  criadoEm!: number;

  @ColunaEpoch('atualizado_em')
  atualizadoEm!: number;
}
