import { bloco, dataIso, lerNfeXml, numero, valorTag, type DuplicataNfe } from './nfe';

/** Nota fiscal lida de um XML: NF-e (produtos, modelo 55) ou NFS-e (serviços, padrão ABRASF ou nacional). */
export interface NotaLida {
  tipo: 'nfe' | 'nfse';
  /** NF-e: chave de 44 dígitos. NFS-e: código de verificação ou CNPJ+número (serve para achar pedido repetido). */
  chave: string;
  numero: string;
  emissao?: string;
  valor: number;
  emitente: { documento: string; nome: string };
  destinatario?: { documento: string; nome: string };
  duplicatas: DuplicataNfe[];
}

const doc = (b?: string) => {
  if (!b) return '';
  const cpfCnpj = bloco(b, 'CpfCnpj') ?? b;
  return valorTag(cpfCnpj, 'Cnpj') ?? valorTag(cpfCnpj, 'CNPJ') ?? valorTag(cpfCnpj, 'Cpf') ?? valorTag(cpfCnpj, 'CPF') ?? '';
};

/** NFS-e: padrão ABRASF (CompNfse/InfNfse, usado por muitas prefeituras) e padrão nacional (NFSe/infNFSe). */
export function lerNfseXml(xml: string): NotaLida {
  const limpo = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/^﻿/, '');
  const incompleto = () => new Error('XML da NFS-e incompleto: faltam número, valor ou prestador');

  const abrasf = bloco(limpo, 'InfNfse');
  if (abrasf) {
    const prest = bloco(abrasf, 'PrestadorServico');
    const tom = bloco(abrasf, 'TomadorServico');
    const valores = bloco(abrasf, 'Valores');
    const valor = numero(valorTag(abrasf, 'ValorLiquidoNfse')) ?? numero(valorTag(valores, 'ValorServicos'));
    const num = valorTag(abrasf, 'Numero');
    if (valor === undefined || !num || !prest) throw incompleto();
    const documentoPrest = doc(bloco(prest, 'IdentificacaoPrestador') ?? prest);
    return {
      tipo: 'nfse', chave: valorTag(abrasf, 'CodigoVerificacao') ?? `${documentoPrest}-${num}`, numero: num, valor,
      emissao: dataIso(valorTag(abrasf, 'DataEmissao')),
      emitente: { documento: documentoPrest, nome: valorTag(prest, 'RazaoSocial') ?? valorTag(prest, 'NomeFantasia') ?? '' },
      ...(tom ? { destinatario: { documento: doc(bloco(tom, 'IdentificacaoTomador') ?? tom), nome: valorTag(tom, 'RazaoSocial') ?? '' } } : {}),
      duplicatas: [],
    };
  }

  const nac = limpo.match(/<(?:\w+:)?infNFSe\b[^>]*>([\s\S]*?)<\/(?:\w+:)?infNFSe>/);
  if (nac) {
    const corpo = nac[1];
    const emit = bloco(corpo, 'emit');
    const toma = bloco(corpo, 'toma');
    const valor = numero(valorTag(bloco(corpo, 'valores'), 'vLiq')) ?? numero(valorTag(corpo, 'vServ'));
    const num = valorTag(corpo, 'nNFSe');
    if (valor === undefined || !num || !emit) throw incompleto();
    const documentoEmit = valorTag(emit, 'CNPJ') ?? valorTag(emit, 'CPF') ?? '';
    return {
      tipo: 'nfse', chave: nac[0].match(/\bId="(?:NFS)?(\d+)"/)?.[1] ?? `${documentoEmit}-${num}`, numero: num, valor,
      emissao: dataIso(valorTag(corpo, 'dhProc') ?? valorTag(corpo, 'dhEmi') ?? valorTag(corpo, 'dCompet')),
      emitente: { documento: documentoEmit, nome: valorTag(emit, 'xNome') ?? '' },
      ...(toma ? { destinatario: { documento: valorTag(toma, 'CNPJ') ?? valorTag(toma, 'CPF') ?? '', nome: valorTag(toma, 'xNome') ?? '' } } : {}),
      duplicatas: [],
    };
  }
  throw new Error('XML não reconhecido: leio NF-e (modelo 55) e NFS-e (padrão ABRASF ou nacional). Digite os dados ou use o PDF.');
}

/** Lê o XML de uma nota, descobrindo se é NF-e ou NFS-e. */
export function lerNotaXml(xml: string): NotaLida {
  if (/<(?:\w+:)?infNFe\b/.test(xml)) { const n = lerNfeXml(xml); return { tipo: 'nfe', chave: n.chave, numero: n.numero, emissao: n.emissao, valor: n.valor, emitente: n.emitente, destinatario: n.destinatario, duplicatas: n.duplicatas }; }
  return lerNfseXml(xml);
}
