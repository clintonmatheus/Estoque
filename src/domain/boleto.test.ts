import { lerBoleto, vencimentoDoFator } from './boleto';

const HOJE = '2026-11-25';

describe('leitura de boleto', () => {
  it('linha digitável de cobrança: valor, vencimento e banco; aceita pontos e espaços', () => {
    const b = lerBoleto('00190.12343 56789.012343 56789.012343 1 16560000123456', HOJE);
    expect(b).toEqual({ tipo: 'cobranca', codigoBarras: '00191165600001234560123456789012345678901234', banco: '001', valor: 1234.56, vencimento: '2026-12-10' });
  });

  it('fator de vencimento do ciclo antigo e sem vencimento; código de barras também vale', () => {
    expect(lerBoleto('23799876504321098765743210987657697340000099900', HOJE)).toMatchObject({ banco: '237', valor: 999, vencimento: '2024-06-01' });
    expect(lerBoleto('34198000000000150001111111111111111111111111', HOJE)).toEqual({ tipo: 'cobranca', codigoBarras: '34198000000000150001111111111111111111111111', banco: '341', valor: 150 });
    expect(vencimentoDoFator(1000, '2025-03-01')).toBe('2025-02-22');
    expect(vencimentoDoFator(9999, '2025-02-10')).toBe('2025-02-21');
  });

  it('convênio (48 dígitos): valor quando é efetivo', () => {
    const b = lerBoleto('826700000001 425001234441 444444444442 444444444442', HOJE);
    expect(b).toMatchObject({ tipo: 'convenio', valor: 42.5, codigoBarras: '82670000000425001234444444444444444444444444' });
  });

  it('erro de digitação é recusado (dígito verificador) e tamanho errado também', () => {
    expect(() => lerBoleto('00190.12343 56789.012343 56789.012344 1 16560000123456', HOJE)).toThrow('Boleto inválido');
    expect(() => lerBoleto('00190.12343 56789.012343 56789.012343 2 16560000123456', HOJE)).toThrow('Boleto inválido');
    expect(() => lerBoleto('00191165600001234560123456789012345678901235', HOJE)).toThrow('Boleto inválido');
    expect(() => lerBoleto('123', HOJE)).toThrow('Boleto inválido');
    expect(() => lerBoleto('826700000001 425001234441 444444444442 444444444443', HOJE)).toThrow('Boleto inválido');
  });
});
