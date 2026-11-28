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

/** Tamanho máximo de XML lido: notas reais têm poucas centenas de kB. */
const MAX_XML = 5 * 1024 * 1024;

/** Tira comentários em tempo linear (comentário sem fim corta o resto). */
export function semComentarios(xml: string): string {
  if (xml.length > MAX_XML) throw new Error('XML grande demais para ler (máximo 5 MB)');
  let r = ''; let pos = 0;
  for (;;) {
    const a = xml.indexOf('<!--', pos);
    if (a < 0) return (r + xml.slice(pos)).replace(/^\uFEFF/, '');
    r += xml.slice(pos, a);
    const b = xml.indexOf('-->', a + 4);
    if (b < 0) return r.replace(/^\uFEFF/, '');
    pos = b + 3;
  }
}

/** Ocorrências de <tag>…</tag> (ignora prefixo de namespace), em tempo linear: abertura sem fechamento encerra a busca. */
export function blocos(xml: string, tag: string, atributos = false): { atributos: string; conteudo: string }[] {
  const abre = new RegExp(`<(?:\\w{1,40}:)?${tag}(\\s[^<>]{0,2000})?>`, 'g');
  const fecha = new RegExp(`</(?:\\w{1,40}:)?${tag}>`, 'g');
  const r: { atributos: string; conteudo: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = abre.exec(xml))) {
    fecha.lastIndex = abre.lastIndex;
    const f = fecha.exec(xml);
    if (!f) break;
    r.push({ atributos: atributos ? m[1] ?? '' : '', conteudo: xml.slice(abre.lastIndex, f.index) });
    abre.lastIndex = fecha.lastIndex;
  }
  return r;
}

/** Conteúdo da primeira ocorrência de <tag>…</tag> dentro de `xml` (ignora prefixo de namespace). */
export function bloco(xml: string, tag: string): string | undefined {
  const abre = new RegExp(`<(?:\\w{1,40}:)?${tag}(?:\\s[^<>]{0,2000})?>`, 'g');
  const m = abre.exec(xml);
  if (!m) return undefined;
  const fecha = new RegExp(`</(?:\\w{1,40}:)?${tag}>`, 'g');
  fecha.lastIndex = abre.lastIndex;
  const f = fecha.exec(xml);
  return f ? xml.slice(abre.lastIndex, f.index) : undefined;
}
export const valorTag = (xml: string | undefined, tag: string) => {
  const b = xml === undefined ? undefined : bloco(xml, tag);
  return b === undefined ? undefined : decodificar(b);
};
export const numero = (s?: string) => { const n = Number(s); return s !== undefined && s !== '' && Number.isFinite(n) ? n : undefined; };
export const dataIso = (s?: string) => s?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];

export function lerNfeXml(xml: string): NfeLida {
  const limpo = semComentarios(xml);
  const achado = blocos(limpo, 'infNFe', true).find((b) => /\bId="NFe\d{44}"/.test(b.atributos));
  const inf = achado ? [ '', achado.atributos.match(/\bId="NFe(\d{44})"/)![1], achado.conteudo ] : null;
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
  const duplicatas = blocos(cobr, 'dup').map(({ conteudo: d }) => ({
    numero: valorTag(d, 'nDup'), vencimento: dataIso(valorTag(d, 'dVenc')), valor: numero(valorTag(d, 'vDup')) ?? 0,
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
