import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { runSeed } from './seeder';
import { SeedService } from './seed.service';

jest.mock('./seeder', () => ({ runSeed: jest.fn() }));

describe('SeedService', () => {
  const runSeedMock = runSeed as jest.MockedFunction<typeof runSeed>;
  const moduleRef = { get: jest.fn().mockReturnValue('instancia') };
  const servico = (autoSeed?: string) =>
    new SeedService(
      moduleRef as unknown as ModuleRef,
      { get: () => autoSeed } as unknown as ConfigService,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  it.each([undefined, 'false'])('não executa com AUTO_SEED=%p', async (valor) => {
    await servico(valor).onApplicationBootstrap();
    expect(runSeedMock).not.toHaveBeenCalled();
  });

  it('com AUTO_SEED=true executa o seed resolvendo providers sem strict', async () => {
    runSeedMock.mockImplementation(async (app) => {
      expect(app.get('TOKEN')).toBe('instancia');
    });
    await servico('true').onApplicationBootstrap();
    expect(runSeedMock).toHaveBeenCalledTimes(1);
    expect(moduleRef.get).toHaveBeenCalledWith('TOKEN', { strict: false });
  });

  it.each([
    [new Error('banco fora'), expect.stringContaining('banco fora')],
    ['texto', 'texto'],
  ])('falha no seed (%p) é logada sem derrubar o bootstrap', async (erro, detalhe) => {
    const logErro = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    runSeedMock.mockRejectedValue(erro);
    await expect(servico('true').onApplicationBootstrap()).resolves.toBeUndefined();
    expect(logErro).toHaveBeenCalledWith('Seed automático falhou', detalhe);
  });
});
