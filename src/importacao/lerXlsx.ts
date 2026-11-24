import JSZip from 'jszip';

export type Celula = string | number | boolean | undefined;
/** Abas da planilha: nome → linhas (a linha 1 da planilha é o índice 0); célula vazia = undefined. */
export type Abas = Record<string, Celula[][]>;

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (s: string) => s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, e: string) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e] ?? m;
});
/** Junta os trechos <t> de uma string (que pode ter várias formatações, <r>). */
const textos = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => decodificar(m[1] ?? '')).join('');
const atributo = (tag: string, nome: string) => tag.match(new RegExp(`\\s${nome}="([^"]*)"`))?.[1];

function indiceColuna(ref: string): number {
  const letras = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Lê um .xlsx (Excel, LibreOffice, Google Planilhas) sem depender do navegador. */
export async function lerXlsx(bytes: Uint8Array): Promise<Abas> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { throw new Error('Arquivo não é uma planilha .xlsx'); }
  const ler = async (caminho: string) => (await zip.file(caminho)?.async('string')) ?? '';
  const workbook = await ler('xl/workbook.xml');
  if (!workbook) throw new Error('Arquivo não é uma planilha .xlsx');
  const rels = await ler('xl/_rels/workbook.xml.rels');
  const alvo = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [atributo(m[0], 'Id'), atributo(m[0], 'Target')]));
  const compartilhadas = [...(await ler('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]));

  const abas: Abas = {};
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const nome = decodificar(atributo(m[0], 'name') ?? '');
    let destino = alvo.get(atributo(m[0], 'r:id')) ?? '';
    destino = destino.startsWith('/') ? destino.slice(1) : `xl/${destino.replace(/^\.\//, '')}`;
    const xml = await ler(destino);
    const linhas: Celula[][] = [];
    for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const n = Number(atributo(r[0], 'r')) - 1;
      const linha: Celula[] = [];
      for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = `<c${c[1]}>`;
        const corpo = c[2] ?? '';
        const t = atributo(tag, 't');
        const v = corpo.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let valor: Celula;
        if (t === 's') valor = v !== undefined ? compartilhadas[Number(v)] : undefined;
        else if (t === 'inlineStr') valor = textos(corpo);
        else if (t === 'str') valor = v !== undefined ? decodificar(v) : undefined;
        else if (t === 'b') valor = v === '1';
        else if (t === 'e') valor = undefined;
        else valor = v !== undefined && v !== '' ? Number(v) : undefined;
        if (typeof valor === 'string' && !valor.trim()) valor = undefined;
        linha[indiceColuna(atributo(tag, 'r') ?? 'A')] = valor;
      }
      if (linha.some((x) => x !== undefined)) linhas[n] = linha;
    }
    abas[nome] = linhas;
  }
  return abas;
}

/** Converte data do Excel (número de série) ou texto dd/mm/aaaa em AAAA-MM-DD. */
export function dataDaCelula(c: Celula): string | undefined {
  if (c === undefined || c === '') return undefined;
  if (typeof c === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(c) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(c).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const t = Date.parse(`${iso}T00:00:00Z`);
    if (!Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso) return iso;
    throw new Error(`Data inválida: ${s}`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  throw new Error(`Data inválida: ${s} (use dd/mm/aaaa)`);
}
