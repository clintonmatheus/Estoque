import { Inflate } from 'pako';
import { lerBoleto, type BoletoLido } from './boleto';

/**
 * Leitura de texto de PDF sem biblioteca nativa: descomprime os fluxos, lê os operadores de texto (Tj/TJ/'/") e
 * aplica os mapas ToUnicode das fontes embutidas. Cobre boletos gerados por bancos e navegadores; PDF escaneado
 * (só imagem) não tem texto e devolve vazio.
 */

/** Limites para um PDF recebido de fora não travar nem estourar a memória do aparelho. */
const MAX_PDF = 15 * 1024 * 1024;
const MAX_FLUXO = 10 * 1024 * 1024;
const MAX_TOTAL = 40 * 1024 * 1024;
const MAX_FLUXOS = 3000;

/** Descomprime parando no limite (um arquivo pequeno pode se expandir para gigabytes). */
function inflarLimitado(dados: Uint8Array, limite: number): Uint8Array {
  const inf = new Inflate();
  const partes: Uint8Array[] = [];
  let total = 0;
  inf.onData = (c: Uint8Array) => {
    total += c.length;
    if (total > limite) throw new Error('Fluxo do PDF grande demais');
    partes.push(c);
  };
  inf.push(dados, true);
  if (inf.err && !partes.length) throw new Error(inf.msg || 'Fluxo inválido');
  const saida = new Uint8Array(total);
  let i = 0;
  for (const c of partes) { saida.set(c, i); i += c.length; }
  return saida;
}

/** Trechos entre `ini` e `fim` (o primeiro `fim` depois de cada `ini`), em tempo linear. */
function trechos(t: string, ini: string, fim: string): string[] {
  const r: string[] = [];
  let pos = 0;
  for (;;) {
    const a = t.indexOf(ini, pos);
    if (a < 0) return r;
    const b = t.indexOf(fim, a + ini.length);
    if (b < 0) return r;
    r.push(t.slice(a + ini.length, b));
    pos = b + fim.length;
  }
}

/** Fim de uma cadeia literal "( … )" que começa em `i` (com escapes e parênteses aninhados); -1 se não fecha. */
function fimLiteral(t: string, i: number): number {
  let nivel = 0;
  for (let j = i; j < t.length; j++) {
    const c = t[j];
    if (c === '\\') { j++; continue; }
    if (c === '(') nivel++;
    else if (c === ')' && --nivel === 0) return j;
  }
  return -1;
}

const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s; };

function fluxos(bytes: Uint8Array): { dicionario: string; dados: Uint8Array }[] {
  const t = latin1(bytes);
  const saida: { dicionario: string; dados: Uint8Array }[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  let total = 0;
  while ((m = re.exec(t)) && saida.length < MAX_FLUXOS) {
    const ini = m.index + m[0].length;
    const fim = t.indexOf('endstream', ini);
    if (fim < 0) break;
    const dicionario = t.slice(Math.max(0, t.lastIndexOf('obj', m.index)), m.index);
    let dados = bytes.subarray(ini, fim);
    if (/\/ASCII85Decode/.test(dicionario)) dados = ascii85(dados);
    const limite = Math.min(MAX_FLUXO, MAX_TOTAL - total);
    if (/\/FlateDecode/.test(dicionario)) { try { dados = inflarLimitado(dados, limite); } catch { dados = new Uint8Array(0); } }
    else if (/\/Filter/.test(dicionario) && !/\/ASCII85Decode/.test(dicionario)) dados = new Uint8Array(0); // outros filtros (imagens): sem texto
    if (dados.length > limite) dados = new Uint8Array(0);
    total += dados.length;
    saida.push({ dicionario, dados });
    re.lastIndex = fim + 9;
  }
  return saida;
}

/** ASCII85 (usado por alguns geradores de PDF antes da compressão). */
function ascii85(b: Uint8Array): Uint8Array {
  const t = latin1(b).replace(/\s/g, '').replace(/^<~/, '');
  const fim = t.indexOf('~>');
  const s = fim >= 0 ? t.slice(0, fim) : t;
  const saida: number[] = [];
  let grupo: number[] = [];
  const emitir = (g: number[], n: number) => {
    let v = 0;
    for (let i = 0; i < 5; i++) v = v * 85 + (g[i] ?? 84);
    for (let i = 0; i < n; i++) saida.push(Math.floor(v / 256 ** (3 - i)) % 256);
  };
  for (const ch of s) {
    if (ch === 'z' && grupo.length === 0) { saida.push(0, 0, 0, 0); continue; }
    grupo.push(ch.charCodeAt(0) - 33);
    if (grupo.length === 5) { emitir(grupo, 4); grupo = []; }
  }
  if (grupo.length > 1) emitir(grupo, grupo.length - 1);
  return Uint8Array.from(saida);
}

const unicodeDeHex = (h: string) => { let s = ''; for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return s; };

/** Junta os mapas ToUnicode de todas as fontes (código hexadecimal → texto). */
function lerCmaps(textos: string[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const t of textos) {
    if (!t.includes('begincmap')) continue;
    for (const bloco of trechos(t, 'beginbfchar', 'endbfchar')) {
      for (const p of bloco.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) mapa.set(p[1].toUpperCase(), unicodeDeHex(p[2]));
    }
    for (const bloco of trechos(t, 'beginbfrange', 'endbfrange')) {
      for (const p of bloco.matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]+>|\[[^\]]*\])/g)) {
        const largura = p[1].length;
        const de = parseInt(p[1], 16); const ate = parseInt(p[2], 16);
        if (p[3].startsWith('[')) {
          [...p[3].matchAll(/<([0-9a-fA-F]+)>/g)].forEach((x, i) => mapa.set((de + i).toString(16).toUpperCase().padStart(largura, '0'), unicodeDeHex(x[1])));
        } else {
          const base = parseInt(p[3].slice(1, -1), 16);
          for (let c = de; c <= ate && c - de < 65536; c++) mapa.set(c.toString(16).toUpperCase().padStart(largura, '0'), String.fromCharCode(base + (c - de)));
        }
      }
    }
  }
  return mapa;
}

function textoLiteral(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_m, e: string) => {
    if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[e] ?? (e.startsWith('\\') || e === '(' || e === ')' ? e : '');
  });
}

function decodificarHex(h: string, mapa: Map<string, string>): string {
  const hex = h.replace(/\s/g, '').toUpperCase();
  if (mapa.size === 0) { let s = ''; for (let i = 0; i + 2 <= hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16)); return s; }
  const larg = mapa.keys().next().value!.length;
  let s = '';
  for (let i = 0; i < hex.length; i += larg) s += mapa.get(hex.slice(i, i + larg)) ?? (larg === 4 ? '' : String.fromCharCode(parseInt(hex.slice(i, i + 2), 16)));
  return s;
}

function textoDoConteudo(conteudo: string, mapa: Map<string, string>): string {
  let saida = '';
  for (const corpo of trechos(conteudo, 'BT', 'ET')) {
    // percorre cadeias literais, hexadecimais e operadores que mudam de linha
    const re = /\(|<([0-9a-fA-F\s]+)>|(-?\d+\.?\d*)|(T\*|Td|TD|Tm|'|")|(Tj|TJ)/g;
    let m: RegExpExecArray | null; let pendente = '';
    while ((m = re.exec(corpo))) {
      if (m[0] === '(') {
        const f = fimLiteral(corpo, m.index);
        if (f < 0) break; // cadeia sem fim: o resto do bloco não tem texto confiável
        const lit = corpo.slice(m.index + 1, f);
        re.lastIndex = f + 1;
        pendente += mapa.size ? decodificarHex(Array.from(textoLiteral(lit)).map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(''), mapa) : textoLiteral(lit);
      }
      else if (m[1] !== undefined) pendente += decodificarHex(m[1], mapa);
      else if (m[2] !== undefined) { if (Number(m[2]) < -250 && pendente) pendente += ' '; }
      else if (m[3]) { if (pendente) { saida += `${pendente}\n`; pendente = ''; } }
      else if (m[4]) { saida += pendente; pendente = ''; }
    }
    saida += `${pendente}\n`;
  }
  return saida;
}

/** Texto do PDF (linhas separadas por quebra). Vazio quando o PDF é só imagem ou está protegido. */
export function extrairTextoPdf(bytes: Uint8Array): string {
  if (bytes.length > MAX_PDF) throw new Error('PDF grande demais para ler (máximo 15 MB)');
  const fl = fluxos(bytes);
  const textos = fl.map((f) => latin1(f.dados));
  const mapa = lerCmaps(textos);
  return textos.filter((t) => { const a = t.indexOf('BT'); return a >= 0 && t.indexOf('ET', a + 2) >= 0 && /T[jJ]/.test(t); }).map((t) => textoDoConteudo(t, mapa)).join('\n');
}

/** Procura no texto um código de boleto válido (confere os dígitos verificadores de cada candidato). */
export function acharBoletoNoTexto(texto: string, hoje: string): (BoletoLido & { linha: string }) | undefined {
  const corridas = texto.match(/\d[\d .\-]{36,70}\d/g) ?? [];
  for (const corrida of corridas) {
    const d = corrida.replace(/\D/g, '');
    // O código de barras (44) só vale quando é o número inteiro: um trecho de 44 dígitos acerta o dígito por acaso (1 em 11).
    for (const tam of d.length === 44 ? [44] : [47, 48]) {
      for (let i = 0; i + tam <= d.length; i++) {
        try { return { ...lerBoleto(d.slice(i, i + tam), hoje), linha: d.slice(i, i + tam) }; } catch { /* tenta o próximo trecho */ }
      }
    }
  }
  return undefined;
}

/** Lê o boleto de dentro de um PDF; devolve vazio se não achar (PDF escaneado, por exemplo). */
export function lerBoletoDoPdf(bytes: Uint8Array, hoje: string) {
  return acharBoletoNoTexto(extrairTextoPdf(bytes), hoje);
}
