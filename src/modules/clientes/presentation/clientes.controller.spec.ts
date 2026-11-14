import { ClientesService } from '../application/clientes.service';
import { ClientesController } from './clientes.controller';

describe('ClientesController', () => {
  const service = {
    create: jest.fn().mockResolvedValue('criado'),
    findAll: jest.fn().mockResolvedValue('todos'),
    findById: jest.fn().mockResolvedValue('um'),
    update: jest.fn().mockResolvedValue('atualizado'),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new ClientesController(service as unknown as ClientesService);

  it('repassa cada rota ao serviço com os argumentos corretos', async () => {
    const dto = { nome: 'João', documento: '52998224725' };
    await expect(controller.create(dto)).resolves.toBe('criado');
    expect(service.create).toHaveBeenCalledWith(dto);
    await expect(controller.findAll()).resolves.toBe('todos');
    await expect(controller.findOne('id-1')).resolves.toBe('um');
    expect(service.findById).toHaveBeenCalledWith('id-1');
    await expect(controller.update('id-1', { nome: 'X' })).resolves.toBe('atualizado');
    expect(service.update).toHaveBeenCalledWith('id-1', { nome: 'X' });
    await controller.remove('id-1');
    expect(service.delete).toHaveBeenCalledWith('id-1');
  });
});
