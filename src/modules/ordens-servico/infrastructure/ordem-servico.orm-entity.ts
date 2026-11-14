import { Column, Entity, Generated, Index, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ColunaEpoch, epochTransformer } from '../../../shared/database/coluna-epoch';
import { StatusOS } from '../domain/status-os';
import { ItemOSOrmEntity } from './item-os.orm-entity';

@Entity({ name: 'ordens_servico' })
@Index(['clienteId'])
@Index(['veiculoId'])
@Index(['status'])
export class OrdemServicoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int', unique: true })
  @Generated('increment')
  numero!: number;

  @Column({ type: 'uuid', name: 'cliente_id' })
  clienteId!: string;

  @Column({ type: 'uuid', name: 'veiculo_id' })
  veiculoId!: string;

  @Column({ type: 'varchar', length: 30, default: StatusOS.RECEBIDA })
  status!: StatusOS;

  @OneToMany(() => ItemOSOrmEntity, (item) => item.ordemServico, { cascade: true, eager: true })
  itens!: ItemOSOrmEntity[];

  @Column({ type: 'varchar', length: 60, name: 'orcamento_id', nullable: true })
  orcamentoId!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'valor_orcamento', nullable: true })
  valorOrcamento!: string | null;

  @Column({ type: 'varchar', length: 60, name: 'pagamento_id', nullable: true })
  pagamentoId!: string | null;

  @Column({ type: 'varchar', length: 60, name: 'execucao_id', nullable: true })
  execucaoId!: string | null;

  @Column({ type: 'boolean', name: 'estoque_reservado', default: false })
  estoqueReservado!: boolean;

  @Column({ type: 'varchar', length: 200, name: 'motivo_cancelamento', nullable: true })
  motivoCancelamento!: string | null;

  @ColunaEpoch('recebida_em')
  recebidaEm!: number;

  @ColunaEpoch('orcamento_gerado_em', { nullable: true })
  orcamentoGeradoEm!: number | null;

  @ColunaEpoch('aprovada_em', { nullable: true })
  aprovadaEm!: number | null;

  @ColunaEpoch('paga_em', { nullable: true })
  pagaEm!: number | null;

  @ColunaEpoch('execucao_iniciada_em', { nullable: true })
  execucaoIniciadaEm!: number | null;

  @ColunaEpoch('finalizada_em', { nullable: true })
  finalizadaEm!: number | null;

  @ColunaEpoch('entregue_em', { nullable: true })
  entregueEm!: number | null;

  @ColunaEpoch('cancelada_em', { nullable: true })
  canceladaEm!: number | null;

  @ColunaEpoch('criado_em')
  criadoEm!: number;

  @ColunaEpoch('atualizado_em')
  atualizadoEm!: number;
}

@Entity({ name: 'os_historico' })
@Index(['osId', 'em'])
export class HistoricoOSOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'os_id' })
  osId!: string;

  @Column({ type: 'varchar', length: 60 })
  evento!: string;

  @Column({ type: 'varchar', length: 30, name: 'status_anterior', nullable: true })
  statusAnterior!: StatusOS | null;

  @Column({ type: 'varchar', length: 30, name: 'status_novo' })
  statusNovo!: StatusOS;

  @Column({ type: 'varchar', length: 300, nullable: true })
  detalhe!: string | null;

  @Column({ type: 'bigint', transformer: epochTransformer })
  em!: number;
}
