import { Repository } from 'typeorm';
import { User } from '../domain/user.entity';
import { UserOrmEntity } from './user.orm-entity';
import { UserTypeOrmRepository } from './user.typeorm.repository';

describe('UserTypeOrmRepository', () => {
  const orm: UserOrmEntity = Object.assign(new UserOrmEntity(), {
    id: 'u-1',
    username: 'admin',
    passwordHash: 'hash',
    criadoEm: 1,
    atualizadoEm: 2,
  });
  let repo: { save: jest.Mock; findOne: jest.Mock };
  let repository: UserTypeOrmRepository;

  beforeEach(() => {
    repo = {
      save: jest.fn().mockImplementation(async (o) => ({ ...o, id: o.id ?? 'novo' })),
      findOne: jest.fn(),
    };
    repository = new UserTypeOrmRepository(repo as unknown as Repository<UserOrmEntity>);
  });

  it('create grava sem id e devolve usuário com id gerado', async () => {
    const u = await repository.create(new User({ username: 'Admin', passwordHash: 'h' }));
    const salvo = repo.save.mock.calls[0][0] as UserOrmEntity;
    expect(salvo.id).toBeUndefined();
    expect(salvo.username).toBe('admin');
    expect(u).toMatchObject({ id: 'novo', username: 'admin', passwordHash: 'h' });
  });

  it('create preserva id quando informado', async () => {
    await repository.create(new User({ id: 'u-9', username: 'joao', passwordHash: 'h' }));
    expect(repo.save.mock.calls[0][0].id).toBe('u-9');
  });

  it('findById devolve domínio ou null', async () => {
    repo.findOne.mockResolvedValueOnce(orm).mockResolvedValueOnce(null);
    expect(await repository.findById('u-1')).toMatchObject({ id: 'u-1', criadoEm: 1 });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'u-1' } });
    expect(await repository.findById('x')).toBeNull();
  });

  it('findByUsername busca em minúsculas', async () => {
    repo.findOne.mockResolvedValueOnce(orm).mockResolvedValueOnce(null);
    expect(await repository.findByUsername('ADMIN')).toBeInstanceOf(User);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { username: 'admin' } });
    expect(await repository.findByUsername('x')).toBeNull();
  });
});
