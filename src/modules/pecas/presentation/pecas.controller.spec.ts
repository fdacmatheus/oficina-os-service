import { PecasService } from '../application/pecas.service';
import { PecasController } from './pecas.controller';

describe('PecasController', () => {
  const service = {
    create: jest.fn().mockResolvedValue('criado'),
    findAll: jest.fn().mockResolvedValue('todos'),
    findEstoqueBaixo: jest.fn().mockResolvedValue('baixo'),
    findById: jest.fn().mockResolvedValue('um'),
    update: jest.fn().mockResolvedValue('atualizado'),
    entradaEstoque: jest.fn().mockResolvedValue('entrada'),
    saidaEstoque: jest.fn().mockResolvedValue('saida'),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new PecasController(service as unknown as PecasService);

  it('repassa cada rota ao serviço com os argumentos corretos', async () => {
    const dto = { sku: 'X', nome: 'Peça', precoUnitario: 1, estoque: 1, estoqueMinimo: 0 };
    await expect(controller.create(dto)).resolves.toBe('criado');
    await expect(controller.findAll(undefined)).resolves.toBe('todos');
    expect(service.findAll).toHaveBeenCalledWith(undefined);
    await expect(controller.findEstoqueBaixo()).resolves.toBe('baixo');
    await expect(controller.findOne('id-1')).resolves.toBe('um');
    await expect(controller.update('id-1', { nome: 'N' })).resolves.toBe('atualizado');
    await expect(controller.entrada('id-1', { quantidade: 3 })).resolves.toBe('entrada');
    expect(service.entradaEstoque).toHaveBeenCalledWith('id-1', 3);
    await expect(controller.saida('id-1', { quantidade: 2 })).resolves.toBe('saida');
    expect(service.saidaEstoque).toHaveBeenCalledWith('id-1', 2);
    await controller.remove('id-1');
    expect(service.delete).toHaveBeenCalledWith('id-1');
  });
});
