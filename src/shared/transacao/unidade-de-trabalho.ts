export const UNIDADE_DE_TRABALHO = Symbol('UNIDADE_DE_TRABALHO');

/**
 * Executa um bloco como uma única transação local.
 *
 * Tudo que os repositórios gravarem dentro de `executar` (OS, estoque,
 * histórico, outbox e inbox) é confirmado junto ou desfeito junto. É o que
 * torna cada passo da saga atômico dentro do os-service.
 */
export interface UnidadeDeTrabalho {
  executar<T>(fn: () => Promise<T>): Promise<T>;
}
