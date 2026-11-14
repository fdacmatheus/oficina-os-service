import type { Request, Response } from 'express';
import { CorrelacaoMiddleware, obterCorrelationId } from './correlacao.middleware';

describe('CorrelacaoMiddleware', () => {
  const executar = (headers: Record<string, string>) => {
    const res = { setHeader: jest.fn() };
    let dentro: string | undefined;
    new CorrelacaoMiddleware().use(
      { headers } as unknown as Request,
      res as unknown as Response,
      () => {
        dentro = obterCorrelationId();
      },
    );
    return { res, dentro };
  };

  it.each([
    [{ 'x-correlation-id': 'c', 'x-amzn-requestid': 'r', 'x-amzn-trace-id': 't' }, 'c'],
    [{ 'x-amzn-requestid': 'r', 'x-amzn-trace-id': 't' }, 'r'],
    [{ 'x-amzn-trace-id': 't' }, 't'],
  ])('reaproveita o id da borda %o', (headers, esperado) => {
    const { res, dentro } = executar(headers);
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', esperado);
    expect(dentro).toBe(esperado);
  });

  it('sem cabeçalho gera um UUID e o expõe no contexto e na resposta', () => {
    const { res, dentro } = executar({});
    expect(dentro).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith('x-correlation-id', dentro);
  });

  it('fora de uma requisição não há correlationId', () => {
    expect(obterCorrelationId()).toBeUndefined();
  });
});
