import { Directory, File, Paths } from 'expo-file-system';

/** Arquivos no celular (expo-file-system). A versão para navegador fica em arquivos.web.ts. */
export const arquivos = {
  ler: (uri: string) => new File(uri).bytes(),
  async baixar(url: string, nome: string): Promise<string> {
    const pasta = new Directory(Paths.document, 'anexos');
    if (!pasta.exists) pasta.create();
    const destino = new File(pasta, nome);
    if (destino.exists) destino.delete();
    return (await File.downloadFileAsync(url, destino)).uri;
  },
  /** Copia a foto escolhida para a pasta do app (não depende do cache/galeria). */
  guardar(uriOrigem: string, nome: string): string {
    const pasta = new Directory(Paths.document, 'anexos');
    if (!pasta.exists) pasta.create();
    const destino = new File(pasta, nome);
    new File(uriOrigem).copy(destino);
    return destino.uri;
  },
};
