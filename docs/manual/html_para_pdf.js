// Uso: node html_para_pdf.js entrada.html saida.pdf
const { chromium } = require('playwright');
(async () => {
  const [, , entrada, saida] = process.argv;
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + entrada, { waitUntil: 'networkidle' });
  await p.pdf({
    path: saida, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-family:Inter,sans-serif;font-size:8px;color:#6B7280;padding:0 15mm;display:flex;justify-content:space-between"><span>Estoque do Galpão — Manual de uso</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '14mm', bottom: '16mm', left: '15mm', right: '15mm' },
  });
  await b.close();
})();
