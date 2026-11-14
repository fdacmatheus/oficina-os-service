import { StatusOS } from './status-os';
import { OrdemServico } from './ordem-servico.entity';

export const ORDEM_SERVICO_REPOSITORY = Symbol('ORDEM_SERVICO_REPOSITORY');

export interface OrdemServicoRepository {
  create(os: OrdemServico): Promise<OrdemServico>;
  update(os: OrdemServico): Promise<OrdemServico>;
  findById(id: string): Promise<OrdemServico | null>;
  /** Lê com bloqueio de linha: dois eventos da mesma OS nunca são processados ao mesmo tempo. */
  findByIdParaAtualizar(id: string): Promise<OrdemServico | null>;
  findByNumero(numero: number): Promise<OrdemServico | null>;
  findAll(filtro?: { status?: StatusOS; clienteId?: string }): Promise<OrdemServico[]>;
  tempoMedioExecucaoMs(): Promise<number | null>;
}
