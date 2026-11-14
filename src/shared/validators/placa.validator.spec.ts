import { validate } from 'class-validator';
import { IsPlaca, isValidPlaca } from './placa.validator';

describe('isValidPlaca', () => {
  it.each(['ABC1D23', 'ABC-1234', 'ABC1234', 'abc1d23'])('aceita placa válida %s', (placa) => {
    expect(isValidPlaca(placa)).toBe(true);
  });

  it.each(['AB1C234', '12345', 'ABCD1234', ''])('rejeita placa inválida %s', (placa) => {
    expect(isValidPlaca(placa)).toBe(false);
  });
});

describe('IsPlaca', () => {
  class Dto {
    @IsPlaca()
    placa: unknown;
  }

  const erros = async (placa: unknown) => {
    const dto = new Dto();
    dto.placa = placa;
    return validate(dto);
  };

  it('aceita placa Mercosul', async () => {
    expect(await erros('ABC1D23')).toHaveLength(0);
  });

  it.each(['12345', 1234, null])('rejeita %p com mensagem dos formatos aceitos', async (placa) => {
    const [erro] = await erros(placa);
    expect(erro.constraints?.isPlaca).toMatch(/ABC-1234 ou ABC1D23/);
  });

  it('isValidPlaca rejeita valor que não é string', () => {
    expect(isValidPlaca(123 as unknown as string)).toBe(false);
  });
});
