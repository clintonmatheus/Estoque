import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** Celular: gera o arquivo e abre o compartilhamento. Versão do navegador em saida.web.ts. */
export async function compartilharPdf(html: string, nome: string, paisagem = false) {
  const { uri } = await Print.printToFileAsync({ html, width: paisagem ? 842 : 595, height: paisagem ? 595 : 842 });
  const destino = new File(Paths.cache, `${nome}.pdf`);
  if (destino.exists) destino.delete();
  new File(uri).move(destino);
  await Sharing.shareAsync(destino.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: nome });
}

export async function compartilharXlsx(bytes: Uint8Array, nome: string) {
  const destino = new File(Paths.cache, `${nome}.xlsx`);
  if (destino.exists) destino.delete();
  destino.create();
  await destino.write(bytes);
  await Sharing.shareAsync(destino.uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: nome,
  });
}
