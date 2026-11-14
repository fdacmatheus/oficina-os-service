import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientesService } from 'src/modules/clientes/application/clientes.service';
import { Veiculo } from '../domain/veiculo.entity';
import { VeiculoRepository } from '../domain/veiculo.repository';
import { VeiculosService } from './veiculos.service';

describe('VeiculosService', () => {
  let repo: jest.Mocked<VeiculoRepository>;
  let clientes: { findById: jest.Mock };
  let service: VeiculosService;
  const input = { clienteId: 'c-1', placa: 'abc-1234', marca: 'VW', modelo: 'Gol', ano: 2020 };
  const existente = () => new Veiculo({ ...input, id: 'v-1', criadoEm: 1 });

  beforeEach(() => {
    repo = {
      create: jest.fn().mockImplementation(async (v: Veiculo) => v),
      update: jest.fn().mockImplementation(async (v: Veiculo) => v),
      findById: jest.fn(),
      findByPlaca: jest.fn().mockResolvedValue(null),
      findByClienteId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    };
    clientes = { findById: jest.fn().mockResolvedValue({}) };
    service = new VeiculosService(repo, clientes as unknown as ClientesService);
  });

  it('cria veículo para cliente existente com placa normalizada', async () => {
    const v = await service.create(input);
    expect(clientes.findById).toHaveBeenCalledWith('c-1');
    expect(repo.findByPlaca).toHaveBeenCalledWith('ABC1234');
    expect(v.placa).toBe('ABC1234');
  });

  it('não cria veículo se o cliente não existe', async () => {
    clientes.findById.mockRejectedValue(new NotFoundException());
    await expect(service.create(input)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejeita placa duplicada', async () => {
    repo.findByPlaca.mockResolvedValue(existente());
    await expect(service.create(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('findAll e findByCliente (valida cliente antes)', async () => {
    await service.findAll();
    expect(repo.findAll).toHaveBeenCalled();
    await service.findByCliente('c-9');
    expect(clientes.findById).toHaveBeenCalledWith('c-9');
    expect(repo.findByClienteId).toHaveBeenCalledWith('c-9');
  });

  it('findById lança NotFound', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.findById('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update sem trocar cliente não consulta clientes', async () => {
    repo.findById.mockResolvedValue(existente());
    const v = await service.update('v-1', { modelo: 'Polo', clienteId: 'c-1' });
    await service.update('v-1', { modelo: 'Polo' });
    expect(clientes.findById).not.toHaveBeenCalled();
    expect(v).toMatchObject({ id: 'v-1', modelo: 'Polo', marca: 'VW', ano: 2020, criadoEm: 1 });
  });

  it('update trocando cliente valida o novo cliente e aplica os campos', async () => {
    repo.findById.mockResolvedValue(existente());
    const v = await service.update('v-1', {
      clienteId: 'c-2',
      placa: 'XYZ1A23',
      marca: 'Fiat',
      ano: 2021,
    });
    expect(clientes.findById).toHaveBeenCalledWith('c-2');
    expect(v).toMatchObject({ clienteId: 'c-2', placa: 'XYZ1A23', marca: 'Fiat', ano: 2021 });
  });

  it('delete remove só veículo existente', async () => {
    repo.findById.mockResolvedValueOnce(existente()).mockResolvedValueOnce(null);
    await service.delete('v-1');
    await expect(service.delete('v-2')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.delete.mock.calls).toEqual([['v-1']]);
  });
});
