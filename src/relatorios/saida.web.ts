/** Navegador: o PDF abre na janela de impressão (salvar como PDF); o Excel é baixado. */
export async function compartilharPdf(html: string, _nome: string, paisagem = false) {
  const janela = window.open('', '_blank');
  if (!janela) throw new Error('Permita pop-ups para gerar o PDF');
  const ajuste = paisagem ? '<style>@page { size: A4 landscape; }</style>' : '';
  janela.document.write(html.replace('</head>', `${ajuste}</head>`));
  janela.document.close();
  janela.focus();
  setTimeout(() => janela.print(), 300);
}

export async function compartilharXlsx(bytes: Uint8Array, nome: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
