import { StatusOS } from './status-os';

export const HISTORICO_OS_REPOSITORY = Symbol('HISTORICO_OS_REPOSITORY');

/** Uma linha da linha do tempo da OS: o que aconteceu e em que estado ela ficou. */
export interface EntradaHistorico {
  osId: string;
  evento: string;
  statusAnterior: StatusOS | null;
  statusNovo: StatusOS;
  detalhe?: string | null;
  em: number;
}

export interface HistoricoOSRepository {
  registrar(entrada: EntradaHistorico): Promise<void>;
  listar(osId: string): Promise<EntradaHistorico[]>;
}
