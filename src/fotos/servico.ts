import * as ImagePicker from 'expo-image-picker';
import { arquivos } from '../sync/arquivos';
import { novoId } from './id';

/** Acesso à câmera e à galeria (a foto do pedido recebida pelo WhatsApp vem da galeria). */
export interface ServicoFotos {
  tirarFoto(): Promise<string | undefined>;
  escolherDaGaleria(): Promise<string | undefined>;
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
