import { readFileSync } from 'fs';
import { join } from 'path';
import { acharBoletoNoTexto, extrairTextoPdf, lerBoletoDoPdf } from './pdf';

const arq = (n: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', n)));

describe('leitura de PDF', () => {
  it('PDF simples (fonte padrão): acha a linha digitável do boleto', () => {
    const r = lerBoletoDoPdf(arq('boleto-simples.pdf'), '2026-11-25');
    expect(r).toMatchObject({ tipo: 'cobranca', valor: 1234.56, vencimento: '2026-12-10', banco: '001' });
  });

  it('PDF gerado por navegador (fonte embutida com ToUnicode): extrai o texto e acha o boleto', () => {
    const texto = extrairTextoPdf(arq('boleto-chromium.pdf'));
    expect(texto).toContain('Aço Potiguar');
    const r = lerBoletoDoPdf(arq('boleto-chromium.pdf'), '2026-11-25');
    expect(r).toMatchObject({ banco: '237', valor: 999 });
    expect(r?.linha).toBe('23799876504321098765743210987657697340000099900');
  });

  it('texto sem boleto, com números parecidos ou dígito errado, não gera falso positivo', () => {
    expect(acharBoletoNoTexto('CNPJ 12.345.678/0001-90 pedido 123456789012345678901234567890', '2026-11-25')).toBeUndefined();
    expect(acharBoletoNoTexto('23799.87650 43210.987657 43210.987657 5 97340000099900', '2026-11-25')).toBeUndefined();
  });

  it('arquivo que não é PDF devolve texto vazio em vez de falhar', () => {
    expect(extrairTextoPdf(new Uint8Array([1, 2, 3]))).toBe('');
  });
});

describe('PDF hostil (recebido de fora)', () => {
  const { deflateSync } = require('node:zlib') as typeof import('node:zlib');
  const pdf = (conteudo: Uint8Array) => {
    const cab = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Filter /FlateDecode >> stream\n');
    const fim = new TextEncoder().encode('\nendstream endobj\n');
    return Uint8Array.from([...cab, ...conteudo, ...fim]);
  };
  it('não trava com muitos BT sem ET nem com cadeia que não fecha', () => {
    const ini = Date.now();
    expect(extrairTextoPdf(pdf(deflateSync('BT '.repeat(120000) + ' Tj')))).toBe('');
    extrairTextoPdf(pdf(deflateSync('BT ' + '('.repeat(100000) + ' Tj ET')));
    expect(Date.now() - ini).toBeLessThan(2000);
  });
  it('não descomprime além do limite', () => {
    const bomba = deflateSync(Buffer.alloc(200 * 1024 * 1024, 32));
    expect(extrairTextoPdf(pdf(bomba))).toBe('');
  });
});
