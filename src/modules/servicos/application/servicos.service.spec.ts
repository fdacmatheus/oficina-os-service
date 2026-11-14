import { NotFoundException } from '@nestjs/common';
import { Servico } from '../domain/servico.entity';
import { ServicoRepository } from '../domain/servico.repository';
import { ServicosService } from './servicos.service';

describe('ServicosService', () => {
  let repo: jest.Mocked<ServicoRepository>;
  let service: ServicosService;
  const existente = () =>
    new Servico({
      id: 's-1',
      nome: 'Alinhamento',
      descricao: 'desc',
      preco: 100,
      duracaoEstimadaMinutos: 30,
      criadoEm: 1,
    });

  beforeEach(() => {
    repo = {
      create: jest.fn().mockImplementation(async (s: Servico) => s),
      update: jest.fn().mockImplementation(async (s: Servico) => s),
      findById: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    };
    service = new ServicosService(repo);
  });

  it('cria serviço validado pelo domínio', async () => {
    const s = await service.create({ nome: 'Troca', preco: 10.556, duracaoEstimadaMinutos: 5 });
    expect(s.preco).toBe(10.56);
    // create não é async: o erro de domínio sai síncrono, não como promise rejeitada.
    expect(() => service.create({ nome: 'Troca', preco: -1, duracaoEstimadaMinutos: 5 })).toThrow(
      /Preço/,
    );
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('findAll repassa includeInativos (padrão false)', async () => {
    await service.findAll();
    await service.findAll(true);
    expect(repo.findAll.mock.calls).toEqual([[false], [true]]);
  });

  it('findById lança NotFound', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.findById('x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update parcial mantém o restante', async () => {
    repo.findById.mockResolvedValue(existente());
    const s = await service.update('s-1', { preco: 150 });
    expect(s).toMatchObject({
      id: 's-1',
      nome: 'Alinhamento',
      descricao: 'desc',
      preco: 150,
      duracaoEstimadaMinutos: 30,
      ativo: true,
      criadoEm: 1,
    });
  });

  it('update aplica todos os campos', async () => {
    repo.findById.mockResolvedValue(existente());
    const s = await service.update('s-1', {
      nome: 'Novo',
      descricao: 'nova',
      duracaoEstimadaMinutos: 90,
      ativo: false,
    });
    expect(s).toMatchObject({ nome: 'Novo', descricao: 'nova', duracaoEstimadaMinutos: 90 });
    expect(s.ativo).toBe(false);
  });

  it('delete remove só serviço existente', async () => {
    repo.findById.mockResolvedValueOnce(existente()).mockResolvedValueOnce(null);
    await service.delete('s-1');
    await expect(service.delete('s-2')).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.delete.mock.calls).toEqual([['s-1']]);
  });
});
