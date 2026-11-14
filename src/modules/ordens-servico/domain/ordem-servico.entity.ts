import { ItemOS, ItemOSProps } from './item-os';
import { podeTransitar, StatusOS } from './status-os';

export interface OrdemServicoProps {
  id?: string;
  numero?: number;
  clienteId: string;
  veiculoId: string;
  status?: StatusOS;
  itens?: ItemOSProps[];
  orcamentoId?: string | null;
  valorOrcamento?: number | null;
  pagamentoId?: string | null;
  execucaoId?: string | null;
  estoqueReservado?: boolean;
  motivoCancelamento?: string | null;
  recebidaEm?: number;
  orcamentoGeradoEm?: number | null;
  aprovadaEm?: number | null;
  pagaEm?: number | null;
  execucaoIniciadaEm?: number | null;
  finalizadaEm?: number | null;
  entregueEm?: number | null;
  canceladaEm?: number | null;
  criadoEm?: number;
  atualizadoEm?: number;
}

/** O que precisa ser desfeito ao cancelar a OS no estado em que ela está. */
export interface Compensacoes {
  liberarEstoque: boolean;
  cancelarOrcamento: boolean;
  estornarPagamento: boolean;
  cancelarExecucao: boolean;
}

export class OrdemServico {
  readonly id?: string;
  numero?: number;
  clienteId: string;
  veiculoId: string;
  status: StatusOS;
  itens: ItemOS[];
  orcamentoId: string | null;
  valorOrcamento: number | null;
  pagamentoId: string | null;
  execucaoId: string | null;
  estoqueReservado: boolean;
  motivoCancelamento: string | null;
  recebidaEm: number;
  orcamentoGeradoEm: number | null;
  aprovadaEm: number | null;
  pagaEm: number | null;
  execucaoIniciadaEm: number | null;
  finalizadaEm: number | null;
  entregueEm: number | null;
  canceladaEm: number | null;
  readonly criadoEm: number;
  atualizadoEm: number;

  constructor(props: OrdemServicoProps) {
    if (!props.clienteId) throw new Error('clienteId é obrigatório');
    if (!props.veiculoId) throw new Error('veiculoId é obrigatório');

    const agora = Date.now();
    this.id = props.id;
    this.numero = props.numero;
    this.clienteId = props.clienteId;
    this.veiculoId = props.veiculoId;
    this.status = props.status ?? StatusOS.RECEBIDA;
    this.itens = (props.itens ?? []).map((i) => new ItemOS(i));
    this.orcamentoId = props.orcamentoId ?? null;
    this.valorOrcamento = props.valorOrcamento ?? null;
    this.pagamentoId = props.pagamentoId ?? null;
    this.execucaoId = props.execucaoId ?? null;
    this.estoqueReservado = props.estoqueReservado ?? false;
    this.motivoCancelamento = props.motivoCancelamento ?? null;
    this.recebidaEm = props.recebidaEm ?? agora;
    this.orcamentoGeradoEm = props.orcamentoGeradoEm ?? null;
    this.aprovadaEm = props.aprovadaEm ?? null;
    this.pagaEm = props.pagaEm ?? null;
    this.execucaoIniciadaEm = props.execucaoIniciadaEm ?? null;
    this.finalizadaEm = props.finalizadaEm ?? null;
    this.entregueEm = props.entregueEm ?? null;
    this.canceladaEm = props.canceladaEm ?? null;
    this.criadoEm = props.criadoEm ?? agora;
    this.atualizadoEm = props.atualizadoEm ?? agora;
  }

  /** Soma dos itens; o valor oficial é o que o billing devolve em `valorOrcamento`. */
  get totalItens(): number {
    return Number(this.itens.reduce((total, item) => total + item.subtotal, 0).toFixed(2));
  }

  get pecas(): ItemOS[] {
    return this.itens.filter((i) => i.tipo === 'PECA');
  }

  get tempoExecucaoMs(): number | null {
    if (!this.execucaoIniciadaEm || !this.finalizadaEm) return null;
    return this.finalizadaEm - this.execucaoIniciadaEm;
  }

  get emAndamento(): boolean {
    return ![StatusOS.FINALIZADA, StatusOS.ENTREGUE, StatusOS.CANCELADA].includes(this.status);
  }

  adicionarItem(item: ItemOSProps): void {
    if (this.status !== StatusOS.RECEBIDA) {
      throw new Error('Itens só podem ser adicionados antes de o orçamento ser gerado');
    }
    this.itens.push(new ItemOS(item));
    this.tocar();
  }

  registrarOrcamento(orcamentoId: string, valor: number): void {
    this.transitar(StatusOS.AGUARDANDO_APROVACAO);
    this.orcamentoId = orcamentoId;
    this.valorOrcamento = valor;
    this.orcamentoGeradoEm = Date.now();
  }

  /** Orçamento aprovado e peças já reservadas: segue para o pagamento. */
  aprovarComEstoqueReservado(): void {
    this.transitar(StatusOS.AGUARDANDO_PAGAMENTO);
    this.estoqueReservado = this.pecas.length > 0;
    this.aprovadaEm = Date.now();
  }

  registrarPagamento(pagamentoId: string): void {
    this.transitar(StatusOS.AGUARDANDO_EXECUCAO);
    this.pagamentoId = pagamentoId;
    this.pagaEm = Date.now();
  }

  iniciarExecucao(execucaoId: string): void {
    this.transitar(StatusOS.EM_EXECUCAO);
    this.execucaoId = execucaoId;
    this.execucaoIniciadaEm = Date.now();
  }

  finalizar(execucaoId: string): void {
    this.transitar(StatusOS.FINALIZADA);
    this.execucaoId = execucaoId;
    this.execucaoIniciadaEm ??= Date.now();
    this.finalizadaEm = Date.now();
  }

  entregar(): void {
    this.transitar(StatusOS.ENTREGUE);
    this.entregueEm = Date.now();
  }

  /**
   * Cancela e devolve o que a saga precisa desfazer. Calculado antes da
   * transição, porque depende do estado em que a OS estava.
   */
  cancelar(motivo: string): Compensacoes {
    const anterior = this.status;
    this.transitar(StatusOS.CANCELADA);
    this.motivoCancelamento = motivo;
    this.canceladaEm = Date.now();

    const compensacoes: Compensacoes = {
      liberarEstoque: this.estoqueReservado,
      cancelarOrcamento: [StatusOS.AGUARDANDO_APROVACAO, StatusOS.AGUARDANDO_PAGAMENTO].includes(
        anterior,
      ),
      estornarPagamento: this.pagamentoId !== null,
      cancelarExecucao: [StatusOS.AGUARDANDO_EXECUCAO, StatusOS.EM_EXECUCAO].includes(anterior),
    };
    this.estoqueReservado = false;
    return compensacoes;
  }

  private transitar(novoStatus: StatusOS): void {
    if (!podeTransitar(this.status, novoStatus)) {
      throw new Error(`Transição inválida: ${this.status} → ${novoStatus}`);
    }
    this.status = novoStatus;
    this.tocar();
  }

  private tocar(): void {
    this.atualizadoEm = Date.now();
  }
}
