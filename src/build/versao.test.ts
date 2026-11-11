// eslint-disable-next-line @typescript-eslint/no-require-imports
const { aplicarVersao } = require('../../scripts/versao');

describe('aplicarVersao', () => {
  const base = { expo: { name: 'RDO', version: '1.0.0', ios: { bundleIdentifier: 'x' }, android: { package: 'x' } } };

  it('define versionCode (Android) e buildNumber (iOS) a partir do número da execução', () => {
    const r = aplicarVersao(base, 42);
    expect(r.expo.android.versionCode).toBe(42);
    expect(r.expo.ios.buildNumber).toBe('42');
  });

  it('não altera o objeto original nem os demais campos', () => {
    const r = aplicarVersao(base, 7);
    expect(base.expo.android).toEqual({ package: 'x' });
    expect(r.expo.ios.bundleIdentifier).toBe('x');
    expect(r.expo.version).toBe('1.0.0');
  });

  it('rejeita número inválido', () => {
    expect(() => aplicarVersao(base, 0)).toThrow('Número de versão inválido');
    expect(() => aplicarVersao(base, NaN)).toThrow('Número de versão inválido');
  });
});
