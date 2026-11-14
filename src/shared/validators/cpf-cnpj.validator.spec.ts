import { validate } from 'class-validator';
import { IsCpfOrCnpj, IsCpfOrCnpjConstraint, isValidCnpj, isValidCpf } from './cpf-cnpj.validator';

describe('isValidCpf', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('aceita CPF válido %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each(['111.111.111-11', '123.456.789-00', '12345678900', ''])(
    'rejeita CPF inválido %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    },
  );
});

describe('isValidCnpj', () => {
  it.each(['11.222.333/0001-81', '11222333000181', '10000008000101'])(
    'aceita CNPJ válido %s',
    (cnpj) => {
      expect(isValidCnpj(cnpj)).toBe(true);
    },
  );

  it.each(['11.111.111/1111-11', '11.222.333/0001-00', ''])('rejeita CNPJ inválido %s', (cnpj) => {
    expect(isValidCnpj(cnpj)).toBe(false);
  });
});

describe('IsCpfOrCnpj', () => {
  class Dto {
    @IsCpfOrCnpj()
    documento: unknown;
  }

  const erros = async (documento: unknown) => {
    const dto = new Dto();
    dto.documento = documento;
    return validate(dto);
  };

  it.each(['52998224725', '11222333000181'])('aceita %s', async (doc) => {
    expect(await erros(doc)).toHaveLength(0);
  });

  it.each(['52998224724', '11222333000182', 123, undefined])('rejeita %p', async (doc) => {
    const [erro] = await erros(doc);
    expect(erro.constraints).toEqual({ isCpfOrCnpj: 'CPF ou CNPJ inválido' });
  });

  it('rejeita CPF com qualquer dígito verificador errado', () => {
    expect(isValidCpf('52998224715')).toBe(false);
    expect(isValidCpf('52998224726')).toBe(false);
    expect(new IsCpfOrCnpjConstraint().validate('52998224725')).toBe(true);
  });
});
