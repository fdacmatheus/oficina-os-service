import { DataSource, EntityManager } from 'typeorm';
import { repositorio, TypeOrmUnidadeDeTrabalho } from './typeorm-unidade-de-trabalho';

class Entidade {}

describe('TypeOrmUnidadeDeTrabalho e repositorio()', () => {
  const repoPadrao = { nome: 'padrao' };
  const repoTx = { nome: 'transacao' };
  let manager: EntityManager;
  let dataSource: DataSource;

  beforeEach(() => {
    manager = { getRepository: jest.fn(() => repoTx) } as unknown as EntityManager;
    dataSource = {
      manager: { getRepository: jest.fn(() => repoPadrao) },
      transaction: jest.fn((fn: (m: EntityManager) => Promise<unknown>) => fn(manager)),
    } as unknown as DataSource;
  });

  it('fora de transação usa o manager padrão do DataSource', () => {
    expect(repositorio(dataSource, Entidade)).toBe(repoPadrao);
    expect(dataSource.manager.getRepository).toHaveBeenCalledWith(Entidade);
  });

  it('dentro de executar usa o EntityManager da transação e devolve o resultado', async () => {
    const uow = new TypeOrmUnidadeDeTrabalho(dataSource);
    const r = await uow.executar(async () => repositorio(dataSource, Entidade));
    expect(r).toBe(repoTx);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    // Ao sair, volta ao manager padrão.
    expect(repositorio(dataSource, Entidade)).toBe(repoPadrao);
  });

  it('transação aninhada reaproveita a externa', async () => {
    const uow = new TypeOrmUnidadeDeTrabalho(dataSource);
    const r = await uow.executar(() => uow.executar(async () => repositorio(dataSource, Entidade)));
    expect(r).toBe(repoTx);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('erro dentro do bloco propaga (o DataSource faz o rollback)', async () => {
    const uow = new TypeOrmUnidadeDeTrabalho(dataSource);
    await expect(
      uow.executar(async () => {
        throw new Error('falhou');
      }),
    ).rejects.toThrow('falhou');
  });
});
