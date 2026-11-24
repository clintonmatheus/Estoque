import JSZip from 'jszip';
import type { Celula } from '../importacao/lerXlsx';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** Monta um .xlsx mínimo (texto em linha e números) para os testes. */
export async function planilha(abas: Record<string, Celula[][]>): Promise<Uint8Array> {
  const zip = new JSZip();
  const nomes = Object.keys(abas);
  zip.file('xl/workbook.xml', `<workbook xmlns:r="r"><sheets>${nomes.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships>${nomes.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`);
  nomes.forEach((n, i) => {
    const linhas = abas[n].map((l, r) => `<row r="${r + 1}">${l.map((c, k) => {
      const ref = `${String.fromCharCode(65 + k)}${r + 1}`;
      if (c === undefined) return '';
      return typeof c === 'number' ? `<c r="${ref}"><v>${c}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(String(c))}</t></is></c>`;
    }).join('')}</row>`).join('');
    zip.file(`xl/worksheets/sheet${i + 1}.xml`, `<worksheet><sheetData>${linhas}</sheetData></worksheet>`);
  });
  return zip.generateAsync({ type: 'uint8array' });
}

