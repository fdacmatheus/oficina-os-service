import { VeiculosService } from '../application/veiculos.service';
import { VeiculosController } from './veiculos.controller';

describe('VeiculosController', () => {
  const service = {
    create: jest.fn().mockResolvedValue('criado'),
    findAll: jest.fn().mockResolvedValue('todos'),
    findByCliente: jest.fn().mockResolvedValue('do-cliente'),
    findById: jest.fn().mockResolvedValue('um'),
    update: jest.fn().mockResolvedValue('atualizado'),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new VeiculosController(service as unknown as VeiculosService);

  beforeEach(() => jest.clearAllMocks());

  it('lista por cliente quando clienteId é informado', async () => {
    await expect(controller.findAll('c-1')).resolves.toBe('do-cliente');
    expect(service.findByCliente).toHaveBeenCalledWith('c-1');
    expect(service.findAll).not.toHaveBeenCalled();
  });

  it('lista todos sem clienteId', async () => {
    await expect(controller.findAll()).resolves.toBe('todos');
    expect(service.findByCliente).not.toHaveBeenCalled();
  });

  it('repassa CRUD ao serviço', async () => {
    const dto = { clienteId: 'c-1', placa: 'ABC1234', marca: 'VW', modelo: 'Gol', ano: 2020 };
    await expect(controller.create(dto)).resolves.toBe('criado');
    await expect(controller.findOne('v-1')).resolves.toBe('um');
    await expect(controller.update('v-1', { ano: 2021 })).resolves.toBe('atualizado');
    expect(service.update).toHaveBeenCalledWith('v-1', { ano: 2021 });
    await controller.remove('v-1');
    expect(service.delete).toHaveBeenCalledWith('v-1');
  });
});
