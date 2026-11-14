import { Column, ColumnOptions, ValueTransformer } from 'typeorm';

/** O driver `pg` devolve bigint como string; o domínio trabalha com number (ms). */
export const epochTransformer: ValueTransformer = {
  to: (valor: number | null | undefined) => valor,
  from: (valor: string | null) => (valor === null ? null : Number(valor)),
};

/** Data como Unix epoch em milissegundos, em coluna `bigint`. */
export function ColunaEpoch(name: string, opcoes: Partial<ColumnOptions> = {}): PropertyDecorator {
  return Column({ type: 'bigint', name, transformer: epochTransformer, ...opcoes });
}
