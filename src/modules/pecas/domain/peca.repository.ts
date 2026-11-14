import { Peca } from './peca.entity';

export const PECA_REPOSITORY = Symbol('PECA_REPOSITORY');

export interface PecaRepository {
  create(peca: Peca): Promise<Peca>;
  update(peca: Peca): Promise<Peca>;
  findById(id: string): Promise<Peca | null>;
  findBySku(sku: string): Promise<Peca | null>;
  findAll(includeInativas?: boolean): Promise<Peca[]>;
  findEstoqueBaixo(): Promise<Peca[]>;
  delete(id: string): Promise<void>;
  /**
   * Baixa atômica: só debita se houver saldo. Devolve `false` sem alterar nada
   * quando falta peça, para a saga decidir a compensação.
   */
  reservar(id: string, quantidade: number): Promise<boolean>;
  liberar(id: string, quantidade: number): Promise<void>;
}
