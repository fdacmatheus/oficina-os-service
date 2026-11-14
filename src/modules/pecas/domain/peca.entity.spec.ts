import { Peca } from './peca.entity';

describe('Peca', () => {
  const base = {
    sku: 'oleo-5w30',
    nome: 'Óleo 5W30',
    precoUnitario: 49.9,
    estoque: 10,
    estoqueMinimo: 5,
  };

  it('cria peça e normaliza SKU para uppercase', () => {
    const p = new Peca(base);
    expect(p.sku).toBe('OLEO-5W30');
    expect(p.ativo).toBe(true);
  });

  it('entrada incrementa estoque', () => {
    const p = new Peca(base);
    p.entrada(5);
    expect(p.estoque).toBe(15);
  });

  it('saida decrementa estoque', () => {
    const p = new Peca(base);
    p.saida(3);
    expect(p.estoque).toBe(7);
  });

  it('rejeita saida maior que estoque', () => {
    const p = new Peca(base);
    expect(() => p.saida(20)).toThrow(/insuficiente/);
  });

  it('estoqueBaixo retorna true quando <= estoqueMinimo', () => {
    const p = new Peca({ ...base, estoque: 5 });
    expect(p.estoqueBaixo).toBe(true);
  });

  it('estoqueBaixo retorna false quando > estoqueMinimo', () => {
    const p = new Peca({ ...base, estoque: 6 });
    expect(p.estoqueBaixo).toBe(false);
  });

  it('rejeita preço negativo', () => {
    expect(() => new Peca({ ...base, precoUnitario: -1 })).toThrow(/Preço/);
  });

  it.each([
    [{ sku: '  ' }, /SKU/],
    [{ nome: 'x' }, /Nome/],
    [{ estoque: 1.5 }, /Estoque deve/],
    [{ estoque: -1 }, /Estoque deve/],
    [{ estoqueMinimo: -1 }, /Estoque mínimo/],
  ])('rejeita props inválidas %o', (override, erro) => {
    expect(() => new Peca({ ...base, ...override })).toThrow(erro);
  });

  it('normaliza descrição e preserva datas informadas', () => {
    const p = new Peca({
      ...base,
      descricao: '  sintético ',
      ativo: false,
      criadoEm: 1,
      atualizadoEm: 2,
    });
    expect(p.descricao).toBe('sintético');
    expect(p.ativo).toBe(false);
    expect(p.criadoEm).toBe(1);
    expect(p.atualizadoEm).toBe(2);
  });

  it.each([0, -1, 1.5])('rejeita entrada com quantidade %p', (q) => {
    expect(() => new Peca(base).entrada(q)).toThrow(/entrada/);
  });

  it.each([0, 2.5])('rejeita saída com quantidade %p', (q) => {
    expect(() => new Peca(base).saida(q)).toThrow(/saída/);
  });
});
