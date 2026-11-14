import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Peca } from '../domain/peca.entity';
import { PECA_REPOSITORY, PecaRepository } from '../domain/peca.repository';
import { PecasService } from './pecas.service';

const baseInput = {
  sku: 'FILTRO',
  nome: 'Filtro de óleo',
  precoUnitario: 30,
  estoque: 10,
  estoqueMinimo: 2,
};

describe('PecasService', () => {
  let service: PecasService;
  let repo: jest.Mocked<PecaRepository>;

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      update: jest.fn().mockImplementation(async (p: Peca) => p),
      findById: jest.fn(),
      findBySku: jest.fn(),
      findAll: jest.fn(),
      findEstoqueBaixo: jest.fn(),
      delete: jest.fn(),
      reservar: jest.fn(),
      liberar: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [PecasService, { provide: PECA_REPOSITORY, useValue: repo }],
    }).compile();
    service = moduleRef.get(PecasService);
  });

  it('rejeita criação com SKU duplicado', async () => {
    repo.findBySku.mockResolvedValue(new Peca(baseInput));
    await expect(service.create(baseInput)).rejects.toBeInstanceOf(ConflictException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('cria peça quando SKU é único, buscando pelo SKU normalizado', async () => {
    repo.findBySku.mockResolvedValue(null);
    repo.create.mockImplementation(async (p) => p);
    const result = await service.create({ ...baseInput, sku: 'filtro' });
    expect(repo.findBySku).toHaveBeenCalledWith('FILTRO');
    expect(result.sku).toBe('FILTRO');
  });

  it('findAll repassa o filtro de inativas (padrão false)', async () => {
    repo.findAll.mockResolvedValue([]);
    await service.findAll();
    await service.findAll(true);
    expect(repo.findAll.mock.calls).toEqual([[false], [true]]);
  });

  it('findEstoqueBaixo delega ao repositório', async () => {
    const lista = [new Peca(baseInput)];
    repo.findEstoqueBaixo.mockResolvedValue(lista);
    await expect(service.findEstoqueBaixo()).resolves.toBe(lista);
  });

  it('findById lança NotFound quando inexistente', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.findById('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('update', () => {
    const atual = () => new Peca({ ...baseInput, id: 'p-1', descricao: 'antiga', criadoEm: 1 });

    it('altera só os campos informados, mantendo SKU, estoque e criadoEm', async () => {
      repo.findById.mockResolvedValue(atual());
      const r = await service.update('p-1', { nome: 'Filtro novo', ativo: false });
      expect(r).toMatchObject({
        id: 'p-1',
        sku: 'FILTRO',
        nome: 'Filtro novo',
        descricao: 'antiga',
        precoUnitario: 30,
        estoque: 10,
        estoqueMinimo: 2,
        ativo: false,
        criadoEm: 1,
      });
      expect(r.atualizadoEm).toBeGreaterThan(1);
    });

    it('aplica preço, descrição e estoque mínimo novos', async () => {
      repo.findById.mockResolvedValue(atual());
      const r = await service.update('p-1', {
        descricao: 'nova',
        precoUnitario: 40,
        estoqueMinimo: 5,
      });
      expect(r).toMatchObject({ descricao: 'nova', precoUnitario: 40, estoqueMinimo: 5 });
    });
  });

  it('entradaEstoque incrementa e persiste', async () => {
    repo.findById.mockResolvedValue(new Peca({ ...baseInput, id: 'p-1' }));
    const r = await service.entradaEstoque('p-1', 5);
    expect(r.estoque).toBe(15);
    expect(repo.update).toHaveBeenCalledWith(r);
  });

  it('entradaEstoque com quantidade inválida lança BadRequest e não persiste', async () => {
    repo.findById.mockResolvedValue(new Peca(baseInput));
    await expect(service.entradaEstoque('p-1', 0)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('saidaEstoque decrementa e persiste', async () => {
    repo.findById.mockResolvedValue(new Peca({ ...baseInput, id: 'p-1' }));
    const result = await service.saidaEstoque('p-1', 4);
    expect(result.estoque).toBe(6);
  });

  it('saída maior que estoque lança BadRequest', async () => {
    repo.findById.mockResolvedValue(new Peca({ ...baseInput, estoque: 1 }));
    await expect(service.saidaEstoque('p-1', 5)).rejects.toThrow(/insuficiente/);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('delete exige peça existente', async () => {
    repo.findById.mockResolvedValueOnce(new Peca(baseInput)).mockResolvedValueOnce(null);
    await service.delete('p-1');
    expect(repo.delete).toHaveBeenCalledWith('p-1');
    await expect(service.delete('p-2')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.delete).toHaveBeenCalledTimes(1);
  });
});
