import { ServicosService } from '../application/servicos.service';
import { ServicosController } from './servicos.controller';

describe('ServicosController', () => {
  const service = {
    create: jest.fn().mockResolvedValue('criado'),
    findAll: jest.fn().mockResolvedValue('todos'),
    findById: jest.fn().mockResolvedValue('um'),
    update: jest.fn().mockResolvedValue('atualizado'),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new ServicosController(service as unknown as ServicosService);

  it('repassa cada rota ao serviço com os argumentos corretos', async () => {
    const dto = { nome: 'Troca', preco: 10, duracaoEstimadaMinutos: 5 };
    await expect(controller.create(dto)).resolves.toBe('criado');
    expect(service.create).toHaveBeenCalledWith(dto);
    await expect(controller.findAll(true)).resolves.toBe('todos');
    expect(service.findAll).toHaveBeenCalledWith(true);
    await expect(controller.findOne('id-1')).resolves.toBe('um');
    await expect(controller.update('id-1', { preco: 5 })).resolves.toBe('atualizado');
    expect(service.update).toHaveBeenCalledWith('id-1', { preco: 5 });
    await controller.remove('id-1');
    expect(service.delete).toHaveBeenCalledWith('id-1');
  });
});
