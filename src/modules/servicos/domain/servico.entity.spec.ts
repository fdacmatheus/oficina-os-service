import { Servico } from './servico.entity';

describe('Servico', () => {
  const base = {
    nome: 'Troca de óleo',
    preco: 150,
    duracaoEstimadaMinutos: 60,
  };

  it('cria serviço válido com ativo=true por padrão', () => {
    const s = new Servico(base);
    expect(s.ativo).toBe(true);
    expect(s.preco).toBe(150);
  });

  it('arredonda preço para 2 casas', () => {
    const s = new Servico({ ...base, preco: 99.999 });
    expect(s.preco).toBe(100);
  });

  it('rejeita preço negativo', () => {
    expect(() => new Servico({ ...base, preco: -1 })).toThrow(/Preço/);
  });

  it('rejeita duração não positiva', () => {
    expect(() => new Servico({ ...base, duracaoEstimadaMinutos: 0 })).toThrow(/Duração/);
  });

  it('rejeita nome curto', () => {
    expect(() => new Servico({ ...base, nome: 'a' })).toThrow(/Nome/);
  });

  it('normaliza descrição e preserva flags e datas', () => {
    const s = new Servico({
      ...base,
      descricao: ' filtro ',
      ativo: false,
      criadoEm: 1,
      atualizadoEm: 2,
    });
    expect(s.descricao).toBe('filtro');
    expect([s.ativo, s.criadoEm, s.atualizadoEm]).toEqual([false, 1, 2]);
  });
});
