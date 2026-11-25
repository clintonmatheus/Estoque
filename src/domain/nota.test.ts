import { lerNotaXml } from './nota';

const ABRASF = `<?xml version="1.0"?><CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd"><Nfse><InfNfse>
<Numero>20260001234</Numero><CodigoVerificacao>ABCD1234</CodigoVerificacao><DataEmissao>2026-11-18T14:20:00</DataEmissao>
<Servico><Valores><ValorServicos>5000.00</ValorServicos></Valores></Servico><ValorLiquidoNfse>4800.00</ValorLiquidoNfse>
<PrestadorServico><IdentificacaoPrestador><CpfCnpj><Cnpj>05948553000275</Cnpj></CpfCnpj></IdentificacaoPrestador><RazaoSocial>Elétrica Natal Ltda</RazaoSocial></PrestadorServico>
<TomadorServico><IdentificacaoTomador><CpfCnpj><Cnpj>11222333000181</Cnpj></CpfCnpj></IdentificacaoTomador><RazaoSocial>ALN</RazaoSocial></TomadorServico>
</InfNfse></Nfse></CompNfse>`;
const NACIONAL = `<NFSe versao="1.00" xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS24082022123456780001909900000000000123456789">
<nNFSe>77</nNFSe><dhProc>2026-11-20T10:00:00-03:00</dhProc><emit><CNPJ>05948553000275</CNPJ><xNome>Serviços Rn Ltda</xNome></emit>
<valores><vLiq>2500.50</vLiq></valores><DPS><infDPS><toma><CNPJ>11222333000181</CNPJ><xNome>Passos</xNome></toma></infDPS></DPS></infNFSe></NFSe>`;

describe('nota fiscal de serviço (NFS-e)', () => {
  it('padrão ABRASF: usa o valor líquido, prestador e tomador', () => {
    expect(lerNotaXml(ABRASF)).toEqual({
      tipo: 'nfse', chave: 'ABCD1234', numero: '20260001234', valor: 4800, emissao: '2026-11-18',
      emitente: { documento: '05948553000275', nome: 'Elétrica Natal Ltda' },
      destinatario: { documento: '11222333000181', nome: 'ALN' }, duplicatas: [],
    });
  });
  it('padrão nacional', () => {
    expect(lerNotaXml(NACIONAL)).toMatchObject({ tipo: 'nfse', numero: '77', valor: 2500.5, emissao: '2026-11-20', emitente: { documento: '05948553000275', nome: 'Serviços Rn Ltda' }, destinatario: { documento: '11222333000181' } });
  });
  it('recusa XML desconhecido e nota incompleta com mensagem clara', () => {
    expect(() => lerNotaXml('<qualquer/>')).toThrow('XML não reconhecido');
    expect(() => lerNotaXml(ABRASF.replace(/<ValorLiquidoNfse>.*<\/ValorLiquidoNfse>/, '').replace('<ValorServicos>5000.00</ValorServicos>', ''))).toThrow('incompleto');
  });
});
