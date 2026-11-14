import { AuthService } from '../application/auth.service';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const tokens = { accessToken: 'a', refreshToken: 'r' };
  const service = {
    register: jest.fn().mockResolvedValue(tokens),
    login: jest.fn().mockResolvedValue(tokens),
    refresh: jest.fn().mockResolvedValue(tokens),
  };
  const controller = new AuthController(service as unknown as AuthService);

  it('register e login repassam usuário e senha', async () => {
    await expect(controller.register({ username: 'admin', password: 'x' })).resolves.toBe(tokens);
    expect(service.register).toHaveBeenCalledWith('admin', 'x');
    await expect(controller.login({ username: 'admin', password: 'y' })).resolves.toBe(tokens);
    expect(service.login).toHaveBeenCalledWith('admin', 'y');
  });

  it('refresh usa o userId do usuário autenticado', async () => {
    await controller.refresh({ userId: 'u-1', username: 'admin' });
    expect(service.refresh).toHaveBeenCalledWith('u-1');
  });
});
