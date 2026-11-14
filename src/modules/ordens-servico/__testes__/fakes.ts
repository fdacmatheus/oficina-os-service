import { Envelope, Fila } from 'src/shared/mensageria/envelope';
import { Inbox, Outbox } from 'src/shared/mensageria/mensageria.port';
import { MetricasService } from 'src/shared/observabilidade/metricas.service';
import { UnidadeDeTrabalho } from 'src/shared/transacao/unidade-de-trabalho';
import { PecaRepository } from 'src/modules/pecas/domain/peca.repository';
import { EntradaHistorico, HistoricoOSRepository } from '../domain/historico-os';
import { OrdemServico } from '../domain/ordem-servico.entity';
import { OrdemServicoRepository } from '../domain/ordem-servico.repository';
import { StatusOS } from '../domain/status-os';

/** Cópia profunda: o fake se comporta como banco, não como referência compartilhada. */
function copiar(os: OrdemServico): OrdemServico {
  return new OrdemServico({ ...os, itens: os.itens.map((i) => ({ ...i })) });
}

export class OrdensEmMemoria implements OrdemServicoRepository {
  readonly dados = new Map<string, OrdemServico>();
  private sequencia = 0;

  async create(os: OrdemServico): Promise<OrdemServico> {
    this.sequencia += 1;
    const salva = copiar(
      new OrdemServico({
        ...os,
        id: `os-${this.sequencia}`,
        numero: this.sequencia,
        itens: os.itens.map((i, idx) => ({ ...i, id: `item-${this.sequencia}-${idx}` })),
      }),
    );
    this.dados.set(salva.id as string, salva);
    return copiar(salva);
  }

  async update(os: OrdemServico): Promise<OrdemServico> {
    this.dados.set(os.id as string, copiar(os));
    return copiar(os);
  }

  async findById(id: string): Promise<OrdemServico | null> {
    const os = this.dados.get(id);
    return os ? copiar(os) : null;
  }

  findByIdParaAtualizar(id: string): Promise<OrdemServico | null> {
    return this.findById(id);
  }

  async findByNumero(numero: number): Promise<OrdemServico | null> {
    const os = [...this.dados.values()].find((o) => o.numero === numero);
    return os ? copiar(os) : null;
  }

  async findAll(filtro?: { status?: StatusOS; clienteId?: string }): Promise<OrdemServico[]> {
    return [...this.dados.values()]
      .filter((o) => !filtro?.status || o.status === filtro.status)
      .filter((o) => !filtro?.clienteId || o.clienteId === filtro.clienteId)
      .map(copiar);
  }

  async tempoMedioExecucaoMs(): Promise<number | null> {
    return null;
  }
}

export class HistoricoEmMemoria implements HistoricoOSRepository {
  readonly entradas: EntradaHistorico[] = [];

  async registrar(entrada: EntradaHistorico): Promise<void> {
    this.entradas.push(entrada);
  }

  async listar(osId: string): Promise<EntradaHistorico[]> {
    return this.entradas.filter((e) => e.osId === osId);
  }
}

/** Só o que a saga usa do repositório de peças: o saldo de estoque. */
export class EstoqueEmMemoria implements Pick<PecaRepository, 'reservar' | 'liberar'> {
  constructor(readonly saldo: Record<string, number> = {}) {}

  async reservar(id: string, quantidade: number): Promise<boolean> {
    if ((this.saldo[id] ?? 0) < quantidade) return false;
    this.saldo[id] -= quantidade;
    return true;
  }

  async liberar(id: string, quantidade: number): Promise<void> {
    this.saldo[id] = (this.saldo[id] ?? 0) + quantidade;
  }
}

export class OutboxEmMemoria implements Outbox {
  readonly mensagens: { fila: Fila; envelope: Envelope }[] = [];

  async adicionar(fila: Fila, envelope: Envelope<unknown>): Promise<void> {
    this.mensagens.push({ fila, envelope: envelope as Envelope });
  }

  tipos(): string[] {
    return this.mensagens.map((m) => m.envelope.type);
  }

  ultima(tipo: string): Envelope | undefined {
    return [...this.mensagens].reverse().find((m) => m.envelope.type === tipo)?.envelope;
  }

  limpar(): void {
    this.mensagens.length = 0;
  }
}

export class InboxEmMemoria implements Inbox {
  private readonly vistas = new Set<string>();

  async registrar(messageId: string): Promise<boolean> {
    if (this.vistas.has(messageId)) return false;
    this.vistas.add(messageId);
    return true;
  }
}

export const uowDireta: UnidadeDeTrabalho = { executar: (fn) => fn() };

export async function valorContador(
  metricas: MetricasService,
  nome: string,
  labels: Record<string, string> = {},
): Promise<number> {
  const { values } = await metricas.registry.getSingleMetric(nome)!.get();
  return values
    .filter((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val))
    .reduce((s, v) => s + v.value, 0);
}
