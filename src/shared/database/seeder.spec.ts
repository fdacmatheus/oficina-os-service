import { Logger } from '@nestjs/common';
import { AuthService } from '../../modules/auth/application/auth.service';
import { USER_REPOSITORY } from '../../modules/auth/domain/user.repository';
import { ClientesService } from '../../modules/clientes/application/clientes.service';
import { CLIENTE_REPOSITORY } from '../../modules/clientes/domain/cliente.repository';
import { PecasService } from '../../modules/pecas/application/pecas.service';
import { PECA_REPOSITORY } from '../../modules/pecas/domain/peca.repository';
import { ServicosService } from '../../modules/servicos/application/servicos.service';
import { SERVICO_REPOSITORY } from '../../modules/servicos/domain/servico.repository';
import { VeiculosService } from '../../modules/veiculos/application/veiculos.service';
import { VEICULO_REPOSITORY } from '../../modules/veiculos/domain/veiculo.repository';
import { Resolver, runSeed } from './seeder';

describe('runSeed', () => {
  const eco = jest.fn(async <T>(x: T) => x);
  let deps: Map<unknown, Record<string, jest.Mock>>;
  let resolver: Resolver;
  const senhaOriginal = process.env.ADMIN_PASSWORD;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    let seq = 0;
    deps = new Map<unknown, Record<string, jest.Mock>>([
      [USER_REPOSITORY, { findByUsername: jest.fn().mockResolvedValue(null) }],
      [AuthService, { register: jest.fn() }],
      [CLIENTE_REPOSITORY, { findByDocumento: jest.fn().mockResolvedValue(null) }],
      [
        ClientesService,
        { create: jest.fn(async (c) => ({ ...c, id: `c-${++seq}`, tipoDocumento: 'CPF' })) },
      ],
      [VEICULO_REPOSITORY, { findByPlaca: jest.fn().mockResolvedValue(null) }],
      [VeiculosService, { create: jest.fn(eco) }],
      [SERVICO_REPOSITORY, { findAll: jest.fn().mockResolvedValue([]) }],
      [ServicosService, { create: jest.fn(eco) }],
      [PECA_REPOSITORY, { findAll: jest.fn().mockResolvedValue([]) }],
      [PecasService, { create: jest.fn(eco) }],
    ]);
    resolver = { get: <T>(token: unknown) => deps.get(token) as T };
  });

  afterEach(() => {
    process.env.ADMIN_PASSWORD = senhaOriginal;
  });

  it('banco vazio: cria admin, clientes, veículos ligados aos clientes, serviços e peças', async () => {
    process.env.ADMIN_PASSWORD = 'segredo';
    await runSeed(resolver);

    expect(deps.get(AuthService)!.register).toHaveBeenCalledWith('admin', 'segredo');
    expect(deps.get(ClientesService)!.create).toHaveBeenCalledTimes(2);
    const veiculos = deps.get(VeiculosService)!.create.mock.calls.map(([v]) => v.clienteId);
    expect(veiculos).toEqual(['c-1', 'c-1', 'c-2']);
    expect(deps.get(ServicosService)!.create).toHaveBeenCalledTimes(4);
    expect(deps.get(PecasService)!.create).toHaveBeenCalledTimes(4);
  });

  it('sem ADMIN_PASSWORD não cria o admin (senha nunca fica no código)', async () => {
    delete process.env.ADMIN_PASSWORD;
    await runSeed(resolver);
    expect(deps.get(AuthService)!.register).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('ADMIN_PASSWORD'));
  });

  it('é idempotente: com dados existentes não cria nada e reaproveita os clientes', async () => {
    process.env.ADMIN_PASSWORD = 'segredo';
    deps.get(USER_REPOSITORY)!.findByUsername.mockResolvedValue({ id: 'u-1' });
    deps
      .get(CLIENTE_REPOSITORY)!
      .findByDocumento.mockImplementation(async (doc: string) => ({ id: `existe-${doc}` }));
    deps.get(VEICULO_REPOSITORY)!.findByPlaca.mockResolvedValue({ id: 'v' });
    deps.get(SERVICO_REPOSITORY)!.findAll.mockResolvedValue([{}]);
    deps.get(PECA_REPOSITORY)!.findAll.mockResolvedValue([{}]);

    await runSeed(resolver);

    for (const svc of [
      AuthService,
      ClientesService,
      VeiculosService,
      ServicosService,
      PecasService,
    ]) {
      const mock = Object.values(deps.get(svc)!)[0];
      expect(mock).not.toHaveBeenCalled();
    }
    expect(deps.get(SERVICO_REPOSITORY)!.findAll).toHaveBeenCalledWith(true);
  });
});
