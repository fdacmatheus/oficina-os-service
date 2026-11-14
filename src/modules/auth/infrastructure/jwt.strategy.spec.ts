import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../presentation/jwt-auth.guard';
import { JwtRefreshAuthGuard } from '../presentation/jwt-refresh-auth.guard';
import { JwtRefreshStrategy } from './jwt-refresh.strategy';
import { JwtStrategy } from './jwt.strategy';

const segredos: Record<string, string> = {
  JWT_SECRET: 'segredo-access',
  JWT_REFRESH_SECRET: 'segredo-refresh',
};
const config = {
  getOrThrow: (k: string) => segredos[k],
} as unknown as ConfigService;

function requisicao(token?: string) {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return { headers, get: (h: string) => headers[h.toLowerCase()] } as Record<string, unknown>;
}

function contexto(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}), getNext: () => null }),
  } as unknown as ExecutionContext;
}

describe('Estratégias e guards JWT', () => {
  const jwt = new JwtService();
  const payload = { sub: 'u-1', username: 'admin' };

  beforeAll(() => {
    // O construtor registra a estratégia no passport com o nome usado pelo guard.
    new JwtStrategy(config);
    new JwtRefreshStrategy(config);
  });

  describe('JwtStrategy', () => {
    it('validate mapeia o payload para o usuário autenticado', async () => {
      await expect(new JwtStrategy(config).validate(payload)).resolves.toEqual({
        userId: 'u-1',
        username: 'admin',
      });
    });

    it('JwtAuthGuard aceita access token assinado com JWT_SECRET e popula req.user', async () => {
      const token = await jwt.signAsync(payload, { secret: segredos.JWT_SECRET });
      const req = requisicao(token);
      await expect(new JwtAuthGuard().canActivate(contexto(req))).resolves.toBe(true);
      expect(req.user).toEqual({ userId: 'u-1', username: 'admin' });
    });

    it('JwtAuthGuard rejeita requisição sem token', async () => {
      await expect(new JwtAuthGuard().canActivate(contexto(requisicao()))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('JwtAuthGuard rejeita token assinado com o segredo de refresh', async () => {
      const token = await jwt.signAsync(payload, { secret: segredos.JWT_REFRESH_SECRET });
      await expect(
        new JwtAuthGuard().canActivate(contexto(requisicao(token))),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('JwtRefreshStrategy', () => {
    it('JwtRefreshAuthGuard aceita refresh token e expõe o próprio token', async () => {
      const token = await jwt.signAsync(payload, { secret: segredos.JWT_REFRESH_SECRET });
      const req = requisicao(token);
      await expect(new JwtRefreshAuthGuard().canActivate(contexto(req))).resolves.toBe(true);
      expect(req.user).toEqual({ userId: 'u-1', username: 'admin', refreshToken: token });
    });

    it('validate devolve refreshToken vazio quando não há cabeçalho', async () => {
      const req = { get: () => undefined } as never;
      await expect(new JwtRefreshStrategy(config).validate(req, payload)).resolves.toEqual({
        userId: 'u-1',
        username: 'admin',
        refreshToken: '',
      });
    });
  });
});
