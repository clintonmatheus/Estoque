/** Leitura do XML da NF-e (modelo 55) que o fornecedor manda por e-mail. Sem DOM: funciona no celular e no navegador. */
export interface DuplicataNfe { numero?: string; vencimento?: string; valor: number }
export interface NfeLida {
  chave: string;
  numero: string;
  serie?: string;
  emissao?: string;
  valor: number;
  emitente: { documento: string; nome: string };
  destinatario?: { documento: string; nome: string };
  /** Parcelas de cobrança que constam na nota (cada uma vira um pedido). */
  duplicatas: DuplicataNfe[];
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (s: string) => s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, e: string) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e] ?? m;
}).trim();

/** Conteúdo da primeira ocorrência de <tag>…</tag> dentro de `xml` (ignora prefixo de namespace). */
export function bloco(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${tag}>`));
  return m?.[1];
}
export const valorTag = (xml: string | undefined, tag: string) => {
  const b = xml === undefined ? undefined : bloco(xml, tag);
  return b === undefined ? undefined : decodificar(b);
};
export const numero = (s?: string) => { const n = Number(s); return s !== undefined && s !== '' && Number.isFinite(n) ? n : undefined; };
export const dataIso = (s?: string) => s?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];

export function lerNfeXml(xml: string): NfeLida {
  const limpo = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/^﻿/, '');
  const inf = limpo.match(/<(?:\w+:)?infNFe\b[^>]*\bId="NFe(\d{44})"[^>]*>([\s\S]*?)<\/(?:\w+:)?infNFe>/);
  if (!inf) throw new Error('XML não reconhecido: só leio NF-e (modelo 55). Para nota de serviço, digite os dados ou use o PDF.');
  const [, chave, corpo] = inf;
  const ide = bloco(corpo, 'ide');
  const emit = bloco(corpo, 'emit');
  const dest = bloco(corpo, 'dest');
  const total = bloco(corpo, 'ICMSTot');
  const valor = numero(valorTag(total, 'vNF'));
  const numeroNota = valorTag(ide, 'nNF');
  const documento = (b?: string) => valorTag(b, 'CNPJ') ?? valorTag(b, 'CPF') ?? '';
  if (valor === undefined || !numeroNota || !emit) throw new Error('XML da NF-e incompleto: faltam número, valor ou emitente');
  const cobr = bloco(corpo, 'cobr') ?? '';
  const duplicatas = [...cobr.matchAll(/<(?:\w+:)?dup>([\s\S]*?)<\/(?:\w+:)?dup>/g)].map((m) => ({
    numero: valorTag(m[1], 'nDup'), vencimento: dataIso(valorTag(m[1], 'dVenc')), valor: numero(valorTag(m[1], 'vDup')) ?? 0,
  }));
  return {
    chave, numero: numeroNota, serie: valorTag(ide, 'serie'),
    emissao: dataIso(valorTag(ide, 'dhEmi') ?? valorTag(ide, 'dEmi')),
    valor,
    emitente: { documento: documento(emit), nome: valorTag(emit, 'xNome') ?? '' },
    ...(dest ? { destinatario: { documento: documento(dest), nome: valorTag(dest, 'xNome') ?? '' } } : {}),
    duplicatas,
  };
}
