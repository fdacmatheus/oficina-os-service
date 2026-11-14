import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { ClientesService } from '../application/clientes.service';
import { Cliente } from '../domain/cliente.entity';
import { ChaveInternaGuard } from './chave-interna.guard';
import { ClientesInternosController } from './clientes-internos.controller';

const contexto = (headers: Record<string, unknown>) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;

describe('ChaveInternaGuard', () => {
  const guard = (chave?: string) =>
    new ChaveInternaGuard({ get: () => chave } as unknown as ConfigService);

  it('aceita a chave certa', () => {
    expect(guard('segredo-123').canActivate(contexto({ 'x-chave-interna': 'segredo-123' }))).toBe(
      true,
    );
  });

  it.each([
    ['sem header', 'segredo-123', {}],
    ['chave errada do mesmo tamanho', 'segredo-123', { 'x-chave-interna': 'segredo-124' }],
    ['chave de tamanho diferente', 'segredo-123', { 'x-chave-interna': 'x' }],
    ['header repetido (array)', 'segredo-123', { 'x-chave-interna': ['a', 'b'] }],
    ['serviço sem chave configurada', undefined, { 'x-chave-interna': 'qualquer' }],
  ])('recusa %s', (_caso, chave, headers) => {
    expect(() => guard(chave).canActivate(contexto(headers))).toThrow(UnauthorizedException);
  });
});

describe('ClientesInternosController', () => {
  const cliente = new Cliente({
    id: 'c-1',
    nome: 'João da Silva',
    documento: '52998224725',
    email: 'joao@x.com',
    telefone: '11999999999',
  });
  const service = { findByDocumento: jest.fn() };
  const controller = new ClientesInternosController(service as unknown as ClientesService);

  it('devolve só o necessário para emitir o token', async () => {
    service.findByDocumento.mockResolvedValueOnce(cliente);
    expect(await controller.porDocumento('529.982.247-25')).toEqual({
      id: 'c-1',
      nome: 'João da Silva',
      documento: '52998224725',
      email: 'joao@x.com',
    });
    expect(service.findByDocumento).toHaveBeenCalledWith('529.982.247-25');
  });

  it('404 quando o cliente não existe', async () => {
    service.findByDocumento.mockResolvedValueOnce(null);
    await expect(controller.porDocumento('00000000000')).rejects.toThrow(NotFoundException);
  });
});
