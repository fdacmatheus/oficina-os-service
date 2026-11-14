import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';

describe('CurrentUser', () => {
  it('extrai req.user do contexto HTTP', () => {
    class Alvo {
      rota(@CurrentUser() _user: unknown) {}
    }
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Alvo, 'rota') as Record<
      string,
      { factory: (data: unknown, ctx: ExecutionContext) => unknown }
    >;
    const { factory } = Object.values(args)[0];
    const user = { userId: 'u-1', username: 'admin' };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;

    expect(factory(undefined, ctx)).toBe(user);
  });
});
