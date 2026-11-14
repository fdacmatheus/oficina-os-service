import { Repository } from 'typeorm';
import { Cliente } from '../domain/cliente.entity';
import { ClienteOrmEntity } from './cliente.orm-entity';
import { ClienteTypeOrmRepository } from './cliente.typeorm.repository';

describe('ClienteTypeOrmRepository', () => {
  const orm: ClienteOrmEntity = Object.assign(new ClienteOrmEntity(), {
    id: 'c-1',
    nome: 'João',
    documento: '52998224725',
    email: null,
    telefone: '11',
    criadoEm: 1,
    atualizadoEm: 2,
  });
  let repo: jest.Mocked<Pick<Repository<ClienteOrmEntity>, 'save' | 'findOne' | 'find' | 'delete'>>;
  let repository: ClienteTypeOrmRepository;

  beforeEach(() => {
    repo = {
      save: jest.fn().mockImplementation(async (o) => ({ ...o, id: o.id ?? 'novo' })),
      findOne: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    } as never;
    repository = new ClienteTypeOrmRepository(repo as unknown as Repository<ClienteOrmEntity>);
  });

  it('create mapeia domínio -> ORM sem id e devolve domínio com id gerado', async () => {
    const c = await repository.create(new Cliente({ nome: 'Ana', documento: '52998224725' }));
    const salvo = repo.save.mock.calls[0][0] as ClienteOrmEntity;
    expect(salvo).toBeInstanceOf(ClienteOrmEntity);
    expect(salvo.id).toBeUndefined();
    expect(salvo).toMatchObject({ nome: 'Ana', documento: '52998224725', email: null });
    expect(typeof salvo.criadoEm).toBe('number');
    expect(c).toBeInstanceOf(Cliente);
    expect(c.id).toBe('novo');
  });

  it('update preserva id e datas', async () => {
    const c = await repository.update(
      new Cliente({
        id: 'c-1',
        nome: 'Ana',
        documento: '52998224725',
        criadoEm: 5,
        atualizadoEm: 6,
      }),
    );
    expect(repo.save.mock.calls[0][0]).toMatchObject({ id: 'c-1', criadoEm: 5, atualizadoEm: 6 });
    expect(c.id).toBe('c-1');
  });

  it('findById e findByDocumento devolvem domínio ou null', async () => {
    repo.findOne.mockResolvedValueOnce(orm).mockResolvedValueOnce(null);
    const c = await repository.findById('c-1');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    expect(c).toMatchObject({ id: 'c-1', telefone: '11', criadoEm: 1, atualizadoEm: 2 });
    await expect(repository.findById('x')).resolves.toBeNull();

    repo.findOne.mockResolvedValueOnce(orm).mockResolvedValueOnce(null);
    await expect(repository.findByDocumento('52998224725')).resolves.toBeInstanceOf(Cliente);
    expect(repo.findOne).toHaveBeenLastCalledWith({ where: { documento: '52998224725' } });
    await expect(repository.findByDocumento('0')).resolves.toBeNull();
  });

  it('findAll mapeia a lista e delete apaga pelo id', async () => {
    repo.find.mockResolvedValue([orm, orm]);
    const lista = await repository.findAll();
    expect(lista).toHaveLength(2);
    expect(lista[0]).toBeInstanceOf(Cliente);
    await repository.delete('c-1');
    expect(repo.delete).toHaveBeenCalledWith({ id: 'c-1' });
  });
});
