import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { arquivos } from '../sync/arquivos';
import { novoId } from './id';

/** Acesso à câmera e à galeria (a foto do pedido recebida pelo WhatsApp vem da galeria). */
export interface DocumentoEscolhido {
  uri: string;
  nome: string;
  formato: 'imagem' | 'pdf' | 'xml';
  /** Conteúdo do arquivo quando é XML (para ler a nota fiscal). */
  texto?: string;
  /** Conteúdo do arquivo quando é PDF (para achar o código do boleto). */
  bytes?: Uint8Array;
}

export interface ServicoFotos {
  tirarFoto(): Promise<string | undefined>;
  escolherDaGaleria(): Promise<string | undefined>;
  /** Escolhe um PDF, XML ou imagem (boleto, nota fiscal, comprovante). */
  escolherDocumento?(): Promise<DocumentoEscolhido | undefined>;
}

function decodificarUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  try { return decodeURIComponent(escape(bin)); } catch { return bin; }
}

function resultado(r: ImagePicker.ImagePickerResult): string | undefined {
  if (r.canceled || !r.assets[0]) return undefined;
  return arquivos.guardar(r.assets[0].uri, `${novoId()}.jpg`);
}

/** Implementação real; não coberta por testes automatizados. */
export const servicoFotosDoApp: ServicoFotos = {
  async tirarFoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return undefined;
    return resultado(await ImagePicker.launchCameraAsync({ quality: 0.6 }));
  },
  async escolherDaGaleria() {
    return resultado(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 }));
  },
};

const FORMATO: Record<string, DocumentoEscolhido['formato']> = { pdf: 'pdf', xml: 'xml', jpg: 'imagem', jpeg: 'imagem', png: 'imagem', webp: 'imagem', heic: 'imagem' };

/** Implementação real do seletor de arquivos; não coberta por testes automatizados. */
servicoFotosDoApp.escolherDocumento = async () => {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'text/xml', 'application/xml', 'image/*'], copyToCacheDirectory: true });
  if (r.canceled || !r.assets[0]) return undefined;
  const a = r.assets[0];
  const ext = (a.name.split('.').pop() ?? '').toLowerCase();
  const formato = FORMATO[ext] ?? (a.mimeType?.includes('pdf') ? 'pdf' : a.mimeType?.includes('xml') ? 'xml' : 'imagem');
  const uri = arquivos.guardar(a.uri, `${novoId()}.${formato === 'imagem' ? 'jpg' : formato}`);
  return {
    uri, nome: a.name, formato,
    ...(formato === 'xml' ? { texto: decodificarUtf8(await arquivos.ler(uri)) } : {}),
    ...(formato === 'pdf' ? { bytes: await arquivos.ler(uri) } : {}),
  };
};
