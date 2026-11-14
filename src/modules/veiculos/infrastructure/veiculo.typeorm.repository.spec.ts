import { Repository } from 'typeorm';
import { Veiculo } from '../domain/veiculo.entity';
import { VeiculoOrmEntity } from './veiculo.orm-entity';
import { VeiculoTypeOrmRepository } from './veiculo.typeorm.repository';

describe('VeiculoTypeOrmRepository', () => {
  const orm: VeiculoOrmEntity = Object.assign(new VeiculoOrmEntity(), {
    id: 'v-1',
    clienteId: 'c-1',
    placa: 'ABC1D23',
    marca: 'VW',
    modelo: 'Gol',
    ano: 2020,
    criadoEm: 1,
    atualizadoEm: 2,
  });
  let repo: { save: jest.Mock; findOne: jest.Mock; find: jest.Mock; delete: jest.Mock };
  let repository: VeiculoTypeOrmRepository;
  const novo = { clienteId: 'c-1', placa: 'abc-1234', marca: 'VW', modelo: 'Gol', ano: 2020 };

  beforeEach(() => {
    repo = {
      save: jest.fn().mockImplementation(async (o) => ({ ...o, id: o.id ?? 'novo' })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([orm]),
      delete: jest.fn(),
    };
    repository = new VeiculoTypeOrmRepository(repo as unknown as Repository<VeiculoOrmEntity>);
  });

  it('create grava placa normalizada sem id', async () => {
    const v = await repository.create(new Veiculo(novo));
    const salvo = repo.save.mock.calls[0][0] as VeiculoOrmEntity;
    expect(salvo.id).toBeUndefined();
    expect(salvo.placa).toBe('ABC1234');
    expect(v.id).toBe('novo');
  });

  it('update mantém id', async () => {
    await repository.update(new Veiculo({ ...novo, id: 'v-1' }));
    expect(repo.save.mock.calls[0][0]).toMatchObject({ id: 'v-1' });
  });

  it('findById e findByPlaca devolvem domínio ou null', async () => {
    repo.findOne
      .mockResolvedValueOnce(orm)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(orm)
      .mockResolvedValueOnce(null);
    expect(await repository.findById('v-1')).toMatchObject({ id: 'v-1', placa: 'ABC1D23' });
    expect(await repository.findById('x')).toBeNull();
    expect(await repository.findByPlaca('ABC1D23')).toBeInstanceOf(Veiculo);
    expect(repo.findOne).toHaveBeenLastCalledWith({ where: { placa: 'ABC1D23' } });
    expect(await repository.findByPlaca('ZZZ9999')).toBeNull();
  });

  it('findByClienteId filtra pelo cliente; findAll lista tudo', async () => {
    expect(await repository.findByClienteId('c-1')).toHaveLength(1);
    expect(repo.find).toHaveBeenLastCalledWith({ where: { clienteId: 'c-1' } });
    const todos = await repository.findAll();
    expect(repo.find).toHaveBeenLastCalledWith();
    expect(todos[0]).toBeInstanceOf(Veiculo);
  });

  it('delete apaga pelo id', async () => {
    await repository.delete('v-1');
    expect(repo.delete).toHaveBeenCalledWith({ id: 'v-1' });
  });
});
