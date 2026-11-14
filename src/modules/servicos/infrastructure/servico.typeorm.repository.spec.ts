import { Repository } from 'typeorm';
import { Servico } from '../domain/servico.entity';
import { ServicoOrmEntity } from './servico.orm-entity';
import { ServicoTypeOrmRepository } from './servico.typeorm.repository';

describe('ServicoTypeOrmRepository', () => {
  const orm: ServicoOrmEntity = Object.assign(new ServicoOrmEntity(), {
    id: 's-1',
    nome: 'Alinhamento',
    descricao: null,
    preco: '120.50',
    duracaoEstimadaMinutos: 60,
    ativo: true,
    criadoEm: 1,
    atualizadoEm: 2,
  });
  let repo: { save: jest.Mock; findOne: jest.Mock; find: jest.Mock; delete: jest.Mock };
  let repository: ServicoTypeOrmRepository;

  beforeEach(() => {
    repo = {
      save: jest.fn().mockImplementation(async (o) => ({ ...o, id: o.id ?? 'novo' })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([orm]),
      delete: jest.fn(),
    };
    repository = new ServicoTypeOrmRepository(repo as unknown as Repository<ServicoOrmEntity>);
  });

  it('create grava preço como numeric string e devolve number', async () => {
    const s = await repository.create(
      new Servico({ nome: 'Troca', preco: 99.9, duracaoEstimadaMinutos: 30 }),
    );
    const salvo = repo.save.mock.calls[0][0] as ServicoOrmEntity;
    expect(salvo.id).toBeUndefined();
    expect(salvo.preco).toBe('99.90');
    expect(s.preco).toBe(99.9);
    expect(s.id).toBe('novo');
  });

  it('update preserva id', async () => {
    await repository.update(
      new Servico({ id: 's-1', nome: 'Troca', preco: 1, duracaoEstimadaMinutos: 1, ativo: false }),
    );
    expect(repo.save.mock.calls[0][0]).toMatchObject({ id: 's-1', ativo: false });
  });

  it('findById converte preço e devolve null se ausente', async () => {
    repo.findOne.mockResolvedValueOnce(orm).mockResolvedValueOnce(null);
    const s = await repository.findById('s-1');
    expect(s).toMatchObject({ id: 's-1', preco: 120.5, descricao: null });
    await expect(repository.findById('x')).resolves.toBeNull();
  });

  it('findAll filtra ativos por padrão e lista todos com includeInativos', async () => {
    await repository.findAll();
    expect(repo.find).toHaveBeenLastCalledWith({ where: { ativo: true } });
    const todos = await repository.findAll(true);
    expect(repo.find).toHaveBeenLastCalledWith(undefined);
    expect(todos[0]).toBeInstanceOf(Servico);
  });

  it('delete apaga pelo id', async () => {
    await repository.delete('s-1');
    expect(repo.delete).toHaveBeenCalledWith({ id: 's-1' });
  });
});
