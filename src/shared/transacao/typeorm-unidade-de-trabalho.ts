import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { UnidadeDeTrabalho } from './unidade-de-trabalho';

const transacaoAtual = new AsyncLocalStorage<EntityManager>();

/**
 * Repositório TypeORM que participa da transação em curso, se houver.
 * Os repositórios usam isto em vez de injetar `Repository<T>` diretamente.
 */
export function repositorio<T extends ObjectLiteral>(
  dataSource: DataSource,
  entidade: EntityTarget<T>,
): Repository<T> {
  return (transacaoAtual.getStore() ?? dataSource.manager).getRepository(entidade);
}

@Injectable()
export class TypeOrmUnidadeDeTrabalho implements UnidadeDeTrabalho {
  constructor(private readonly dataSource: DataSource) {}

  executar<T>(fn: () => Promise<T>): Promise<T> {
    // Transação aninhada reaproveita a externa em vez de abrir outra.
    if (transacaoAtual.getStore()) return fn();
    return this.dataSource.transaction((manager) => transacaoAtual.run(manager, fn));
  }
}
