import { ConflictException, NotFoundException } from '@nestjs/common';
import { Cliente } from '../domain/cliente.entity';
import { ClienteRepository } from '../domain/cliente.repository';
import { ClientesService } from './clientes.service';

const CPF = '52998224725';
const CNPJ = '11222333000181';

describe('ClientesService', () => {
  let repo: jest.Mocked<ClienteRepository>;
  let service: ClientesService;
  const existente = () =>
    new Cliente({
      id: 'c-1',
      nome: 'João',
      documento: CPF,
      email: 'a@a.com',
      telefone: '1',
      criadoEm: 1,
    });

  beforeEach(() => {
    repo = {
      create: jest.fn().mockImplementation(async (c: Cliente) => c),
      update: jest.fn().mockImplementation(async (c: Cliente) => c),
      findById: jest.fn(),
      findByDocumento: jest.fn(),
      findAll: jest.fn(),
      delete: jest.fn(),
    };
    service = new ClientesService(repo);
  });

  it('cria cliente com documento normalizado', async () => {
    repo.findByDocumento.mockResolvedValue(null);
    const c = await service.create({ nome: 'João', documento: '529.982.247-25' });
    expect(repo.findByDocumento).toHaveBeenCalledWith(CPF);
    expect(c.documento).toBe(CPF);
  });

  it('rejeita documento já cadastrado', async () => {
    repo.findByDocumento.mockResolvedValue(existente());
    await expect(service.create({ nome: 'João', documento: CPF })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('findAll delega ao repositório', async () => {
    repo.findAll.mockResolvedValue([existente()]);
    expect(await service.findAll()).toHaveLength(1);
  });

  it('findById lança NotFound quando não existe', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.findById('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update mantém campos não informados e criadoEm', async () => {
    repo.findById.mockResolvedValue(existente());
    const c = await service.update('c-1', { nome: 'João Novo' });
    expect(c).toMatchObject({
      id: 'c-1',
      nome: 'João Novo',
      documento: CPF,
      email: 'a@a.com',
      telefone: '1',
      criadoEm: 1,
    });
  });

  it('update aplica todos os campos informados', async () => {
    repo.findById.mockResolvedValue(existente());
    const c = await service.update('c-1', {
      documento: CNPJ,
      email: 'b@b.com',
      telefone: '2',
    });
    expect(c).toMatchObject({ documento: CNPJ, email: 'b@b.com', telefone: '2' });
    expect(c.tipoDocumento).toBe('CNPJ');
  });

  it('delete remove só cliente existente', async () => {
    repo.findById.mockResolvedValueOnce(existente()).mockResolvedValueOnce(null);
    await service.delete('c-1');
    await expect(service.delete('c-2')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.delete.mock.calls).toEqual([['c-1']]);
  });
});
