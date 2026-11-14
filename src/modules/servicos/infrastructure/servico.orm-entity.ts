import { ColunaEpoch } from '../../../shared/database/coluna-epoch';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'servicos' })
export class ServicoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  nome!: string;

  @Column({ type: 'text', nullable: true })
  descricao!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  preco!: string;

  @Column({ type: 'int', name: 'duracao_estimada_minutos' })
  duracaoEstimadaMinutos!: number;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @ColunaEpoch('criado_em')
  criadoEm!: number;

  @ColunaEpoch('atualizado_em')
  atualizadoEm!: number;
}
