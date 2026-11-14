import { ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let res: { status: jest.Mock; json: jest.Mock };
  let logErro: jest.SpyInstance;
  const filtro = new HttpExceptionFilter();

  const host = () =>
    ({
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => ({ method: 'GET', url: '/api/x' }),
      }),
    }) as unknown as ArgumentsHost;

  beforeEach(() => {
    res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    logErro = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('HttpException mantém status e corpo e não loga como erro', () => {
    filtro.catch(new NotFoundException('Cliente não encontrado'), host());
    expect(res.status).toHaveBeenCalledWith(404);
    const corpo = res.json.mock.calls[0][0];
    expect(corpo).toMatchObject({
      statusCode: 404,
      path: '/api/x',
      message: expect.objectContaining({ message: 'Cliente não encontrado' }),
    });
    expect(typeof corpo.timestamp).toBe('number');
    expect(logErro).not.toHaveBeenCalled();
  });

  it('erro desconhecido vira 500 genérico e loga o stack', () => {
    const erro = new Error('banco caiu');
    filtro.catch(erro, host());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].message).toBe('Internal server error');
    expect(logErro).toHaveBeenCalledWith('GET /api/x', erro.stack);
  });

  it('valor lançado que não é Error é logado como string', () => {
    filtro.catch('falhou', host());
    expect(logErro).toHaveBeenCalledWith('GET /api/x', 'falhou');
  });
});
