import { DataSource } from 'typeorm';
import { TypeOrmUnidadeDeTrabalho } from 'src/shared/transacao/typeorm-unidade-de-trabalho';
import { Peca } from '../domain/peca.entity';
import { PecaOrmEntity } from './peca.orm-entity';
import { PecaTypeOrmRepository } from './peca.typeorm.repository';

function criarQb(resultado: unknown) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['where', 'andWhere', 'update', 'set']) qb[m] = jest.fn(() => qb);
  qb.getMany = jest.fn().mockResolvedValue(resultado);
  qb.execute = jest.fn().mockResolvedValue(resultado);
  return qb;
}

describe('PecaTypeOrmRepository', () => {
  const orm: PecaOrmEntity = Object.assign(new PecaOrmEntity(), {
    id: 'p-1',
    sku: 'FILTRO',
    nome: 'Filtro',
    descricao: null,
    precoUnitario: '35.00',
    estoque: 3,
    estoqueMinimo: 5,
    ativo: true,
    criadoEm: 1,
    atualizadoEm: 2,
  });
  let repo: Record<string, jest.Mock>;
  let dataSource: DataSource;
  let repository: PecaTypeOrmRepository;

  beforeEach(() => {
    repo = {
      save: jest.fn().mockImplementation(async (o) => ({ ...o, id: o.id ?? 'novo' })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([orm]),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    dataSource = { manager: { getRepository: jest.fn(() => repo) } } as unknown as DataSource;
    repository = new PecaTypeOrmRepository(dataSource);
  });

  it('usa o repositório da entidade PecaOrmEntity do DataSource fora de transação', async () => {
    await repository.delete('p-1');
    expect(dataSource.manager.getRepository).toHaveBeenCalledWith(PecaOrmEntity);
    expect(repo.delete).toHaveBeenCalledWith({ id: 'p-1' });
  });

  it('dentro de uma unidade de trabalho usa o EntityManager da transação', async () => {
    const repoTx = { delete: jest.fn() };
    const manager = { getRepository: jest.fn(() => repoTx) };
    (dataSource as unknown as { transaction: unknown }).transaction = jest.fn((fn) => fn(manager));
    await new TypeOrmUnidadeDeTrabalho(dataSource).executar(() => repository.delete('p-1'));
    expect(repoTx.delete).toHaveBeenCalledWith({ id: 'p-1' });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('create grava preço como string com 2 casas e sem id', async () => {
    const p = await repository.create(
      new Peca({ sku: 'oleo', nome: 'Óleo', precoUnitario: 49.9, estoque: 1, estoqueMinimo: 0 }),
    );
    const salvo = repo.save.mock.calls[0][0] as PecaOrmEntity;
    expect(salvo.id).toBeUndefined();
    expect(salvo).toMatchObject({ sku: 'OLEO', precoUnitario: '49.90' });
    expect(p.precoUnitario).toBe(49.9);
    expect(p.id).toBe('novo');
  });

  it('update mantém o id', async () => {
    await repository.update(new Peca({ ...orm, precoUnitario: 35 }));
    expect(repo.save.mock.calls[0][0]).toMatchObject({ id: 'p-1', precoUnitario: '35.00' });
  });

  it('findById e findBySku (SKU em maiúsculas) devolvem domínio ou null', async () => {
    repo.findOne
      .mockResolvedValueOnce(orm)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(orm)
      .mockResolvedValueOnce(null);
    expect(await repository.findById('p-1')).toMatchObject({ id: 'p-1', precoUnitario: 35 });
    expect(await repository.findById('x')).toBeNull();
    expect(await repository.findBySku('filtro')).toBeInstanceOf(Peca);
    expect(repo.findOne).toHaveBeenLastCalledWith({ where: { sku: 'FILTRO' } });
    expect(await repository.findBySku('nada')).toBeNull();
  });

  it('findAll filtra ativas por padrão', async () => {
    await repository.findAll();
    expect(repo.find).toHaveBeenLastCalledWith({ where: { ativo: true } });
    expect(await repository.findAll(true)).toHaveLength(1);
    expect(repo.find).toHaveBeenLastCalledWith(undefined);
  });

  it('findEstoqueBaixo filtra ativas com estoque <= mínimo', async () => {
    const qb = criarQb([orm]);
    repo.createQueryBuilder.mockReturnValue(qb);
    const lista = await repository.findEstoqueBaixo();
    expect(repo.createQueryBuilder).toHaveBeenCalledWith('p');
    expect(qb.where).toHaveBeenCalledWith('p.ativo = true');
    expect(qb.andWhere).toHaveBeenCalledWith('p.estoque <= p.estoque_minimo');
    expect(lista[0].estoqueBaixo).toBe(true);
  });

  describe('reservar', () => {
    it.each([
      [{ affected: 1 }, true],
      [{ affected: 0 }, false],
      [{}, false],
    ])('com resultado %o devolve %p', async (resultado, esperado) => {
      const qb = criarQb(resultado);
      repo.createQueryBuilder.mockReturnValue(qb);
      await expect(repository.reservar('p-1', 2)).resolves.toBe(esperado);
    });

    it('debita atomicamente só se houver saldo', async () => {
      const qb = criarQb({ affected: 1 });
      repo.createQueryBuilder.mockReturnValue(qb);
      await repository.reservar('p-1', 2);
      const set = qb.set.mock.calls[0][0];
      expect(set.estoque()).toBe('estoque - 2');
      expect(typeof set.atualizadoEm).toBe('number');
      expect(qb.where).toHaveBeenCalledWith('id = :id AND estoque >= :quantidade', {
        id: 'p-1',
        quantidade: 2,
      });
    });
  });

  it('liberar devolve a quantidade ao estoque', async () => {
    const qb = criarQb({ affected: 1 });
    repo.createQueryBuilder.mockReturnValue(qb);
    await repository.liberar('p-1', 4);
    expect(qb.set.mock.calls[0][0].estoque()).toBe('estoque + 4');
    expect(qb.where).toHaveBeenCalledWith('id = :id', { id: 'p-1' });
    expect(qb.execute).toHaveBeenCalled();
  });
});
