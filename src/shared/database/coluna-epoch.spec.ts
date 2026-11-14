import { getMetadataArgsStorage } from 'typeorm';
import { ColunaEpoch, epochTransformer } from './coluna-epoch';

describe('epochTransformer', () => {
  it('converte o bigint que o pg devolve como string para number (ms)', () => {
    expect(epochTransformer.from('1794692596844')).toBe(1794692596844);
    expect(epochTransformer.from(null)).toBeNull();
  });

  it('grava o number sem alteração', () => {
    expect(epochTransformer.to(1794692596844)).toBe(1794692596844);
    expect(epochTransformer.to(null)).toBeNull();
  });
});

describe('ColunaEpoch', () => {
  class Alvo {
    @ColunaEpoch('criado_em')
    criadoEm!: number;

    @ColunaEpoch('publicado_em', { nullable: true })
    publicadoEm!: number | null;
  }

  const opcoes = (prop: string) =>
    getMetadataArgsStorage().columns.find((c) => c.target === Alvo && c.propertyName === prop)!
      .options;

  it('registra coluna bigint com o nome e o transformer', () => {
    expect(opcoes('criadoEm')).toMatchObject({
      type: 'bigint',
      name: 'criado_em',
      transformer: epochTransformer,
    });
  });

  it('mescla opções extras', () => {
    expect(opcoes('publicadoEm')).toMatchObject({ name: 'publicado_em', nullable: true });
  });
});
