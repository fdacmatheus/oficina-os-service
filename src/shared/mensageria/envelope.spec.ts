import { criarEnvelope, lerEnvelope, ORIGEM } from './envelope';

describe('envelope', () => {
  it('criarEnvelope preenche id único, origem e occurredAt em epoch ms', () => {
    const antes = Date.now();
    const a = criarEnvelope('OrcamentoGerado', 'os-1', { valor: 10 });
    const b = criarEnvelope('OrcamentoGerado', 'os-1', { valor: 10 });
    expect(a).toMatchObject({
      type: 'OrcamentoGerado',
      correlationId: 'os-1',
      source: ORIGEM,
      payload: { valor: 10 },
    });
    expect(a.messageId).not.toBe(b.messageId);
    expect(typeof a.occurredAt).toBe('number');
    expect(a.occurredAt).toBeGreaterThanOrEqual(antes);
  });

  it('lerEnvelope faz o caminho inverso', () => {
    const e = criarEnvelope('X', 'os-1', { a: 1 });
    expect(lerEnvelope(JSON.stringify(e))).toEqual(e);
  });

  it.each([
    { type: 'X', correlationId: 'c', payload: {} },
    { messageId: 'm', correlationId: 'c', payload: {} },
    { messageId: 'm', type: 'X', payload: {} },
    { messageId: 'm', type: 'X', correlationId: 'c', payload: 'texto' },
    { messageId: 'm', type: 'X', correlationId: 'c', payload: null },
  ])('rejeita envelope incompleto %o', (dado) => {
    expect(() => lerEnvelope(JSON.stringify(dado))).toThrow('fora do formato');
  });

  it('rejeita JSON inválido', () => {
    expect(() => lerEnvelope('não é json')).toThrow(SyntaxError);
  });
});
