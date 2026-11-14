import { User } from './user.entity';

describe('User', () => {
  it('normaliza username e preenche datas em epoch ms', () => {
    const u = new User({ username: '  Admin ', passwordHash: 'h' });
    expect(u.username).toBe('admin');
    expect(typeof u.criadoEm).toBe('number');
    expect(
      new User({ username: 'abc', passwordHash: 'h', criadoEm: 1, atualizadoEm: 2 }),
    ).toMatchObject({ criadoEm: 1, atualizadoEm: 2 });
  });

  it.each(['', 'ab', '   ab  '])('rejeita username curto %p', (username) => {
    expect(() => new User({ username, passwordHash: 'h' })).toThrow(/Username/);
  });

  it('exige passwordHash', () => {
    expect(() => new User({ username: 'admin', passwordHash: '' })).toThrow(/passwordHash/);
  });
});
