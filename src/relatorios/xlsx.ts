import JSZip from 'jszip';
import type { Relatorio } from './relatorios';

/** Gera um .xlsx simples (uma planilha) com cabeçalho, números como número e valores em R$. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function coluna(n: number): string {
  let s = '';
  for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

// estilos: 0 normal, 1 cabeçalho, 2 número, 3 moeda, 4 título, 5 negrito, 6 negrito número, 7 negrito moeda
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.###"/><numFmt numFmtId="165" formatCode="&quot;R$&quot; #,##0.00"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2B2B2B"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="8"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/><xf fontId="2" applyFont="1"/><xf fontId="3" applyFont="1"/><xf fontId="3" numFmtId="164" applyFont="1" applyNumberFormat="1"/><xf fontId="3" numFmtId="165" applyFont="1" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export async function relatorioXlsx(r: Relatorio): Promise<Uint8Array> {
  const linhas: string[] = [];
  const texto = (ref: string, v: string, s: number) => `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  linhas.push(`<row r="1">${texto('A1', r.titulo, 4)}</row>`);
  linhas.push(`<row r="2">${texto('A2', r.subtitulo, 0)}</row>`);
  linhas.push(`<row r="4">${r.colunas.map((c, i) => texto(`${coluna(i)}4`, c.titulo, 1)).join('')}</row>`);
  r.linhas.forEach((l, k) => {
    const n = k + 5;
    const negrito = !!l.estilo;
    const cel = l.celulas.map((c, i) => {
      const ref = `${coluna(i)}${n}`;
      if (typeof c === 'number') {
        const s = r.colunas[i].tipo === 'moeda' ? (negrito ? 7 : 3) : (negrito ? 6 : 2);
        return `<c r="${ref}" s="${s}"><v>${c}</v></c>`;
      }
      return c === '' ? '' : texto(ref, c, negrito ? 5 : 0);
    }).join('');
    linhas.push(`<row r="${n}">${cel}</row>`);
  });
  const larguras = r.colunas.map((c, i) => {
    const max = Math.max(c.titulo.length, ...r.linhas.map((l) => String(l.celulas[i] ?? '').length));
    return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(10, max + 4))}" customWidth="1"/>`;
  }).join('');
  const planilha = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${larguras}</cols><sheetData>${linhas.join('')}</sheetData></worksheet>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Relatório" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', ESTILOS);
  zip.file('xl/worksheets/sheet1.xml', planilha);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
