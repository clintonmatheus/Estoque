import * as DocumentPicker from 'expo-document-picker';
import { arquivos } from '../sync/arquivos';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Abre o seletor de arquivos (celular ou computador) e devolve o conteúdo da planilha escolhida. */
export async function escolherPlanilha(): Promise<Uint8Array | undefined> {
  const r = await DocumentPicker.getDocumentAsync({ type: [XLSX, 'application/octet-stream', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets.length) return undefined;
  const a = r.assets[0];
  if (a.file) return new Uint8Array(await a.file.arrayBuffer());
  return arquivos.ler(a.uri);
}
