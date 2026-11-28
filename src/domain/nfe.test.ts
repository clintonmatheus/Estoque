import { lerNfeXml } from './nfe';

const CHAVE = '24261112345678000190550010000012341000012343';
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${CHAVE}" versao="4.00">
<ide><cUF>24</cUF><serie>1</serie><nNF>1234</nNF><dhEmi>2026-11-20T09:30:00-03:00</dhEmi></ide>
<emit><CNPJ>12345678000190</CNPJ><xNome>A&amp;B Materiais de Construção Ltda</xNome></emit>
<dest><CNPJ>05948553000275</CNPJ><xNome>A. L. N. Serviços e Construções Ltda.</xNome></dest>
<det nItem="1"><prod><vProd>999.99</vProd></prod></det>
<total><ICMSTot><vProd>2100.00</vProd><vNF>2100.50</vNF></ICMSTot></total>
<cobr><fat><nFat>1234</nFat><vOrig>2100.50</vOrig></fat>
<dup><nDup>001</nDup><dVenc>2026-12-20</dVenc><vDup>1050.25</vDup></dup>
<dup><nDup>002</nDup><dVenc>2027-01-20</dVenc><vDup>1050.25</vDup></dup></cobr>
</infNFe></NFe></nfeProc>`;

describe('leitura de XML da NF-e', () => {
  it('lê chave, número, emitente, destinatário, valor total e as parcelas de cobrança', () => {
    expect(lerNfeXml(XML)).toEqual({
      chave: CHAVE, numero: '1234', serie: '1', emissao: '2026-11-20', valor: 2100.5,
      emitente: { documento: '12345678000190', nome: 'A&B Materiais de Construção Ltda' },
      destinatario: { documento: '05948553000275', nome: 'A. L. N. Serviços e Construções Ltda.' },
      duplicatas: [{ numero: '001', vencimento: '2026-12-20', valor: 1050.25 }, { numero: '002', vencimento: '2027-01-20', valor: 1050.25 }],
    });
  });

  it('nota sem cobrança, com CPF e BOM; XML que não é NF-e é recusado com mensagem clara', () => {
    const sem = XML.replace(/<cobr>[\s\S]*<\/cobr>/, '').replace('<dest><CNPJ>05948553000275</CNPJ>', '<dest><CPF>52998224725</CPF>');
    const n = lerNfeXml('﻿' + sem);
    expect(n.duplicatas).toEqual([]);
    expect(n.destinatario?.documento).toBe('52998224725');
    expect(() => lerNfeXml('<CompNfse><Nfse/></CompNfse>')).toThrow('só leio NF-e');
    expect(() => lerNfeXml(XML.replace('<vNF>2100.50</vNF>', ''))).toThrow('incompleto');
  });
});

describe('XML hostil (recebido de fora)', () => {
  it('comentários e tags sem fechamento não travam a leitura', () => {
    const ini = Date.now();
    expect(() => lerNfeXml('<!--'.repeat(200000))).toThrow('XML não reconhecido');
    expect(() => lerNfeXml('<infNFe Id="NFe' + '1'.repeat(44) + '">' + '<dup>'.repeat(200000))).toThrow();
    expect(Date.now() - ini).toBeLessThan(2000);
  });
  it('recusa XML grande demais', () => {
    expect(() => lerNfeXml(' '.repeat(6 * 1024 * 1024))).toThrow('grande demais');
  });
});
