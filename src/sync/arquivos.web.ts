/** Arquivos no navegador: as fotos ficam como endereço (blob/URL assinada) durante a sessão. */
export const arquivos = {
  async ler(uri: string) { return new Uint8Array(await (await fetch(uri)).arrayBuffer()); },
  async baixar(url: string, _nome: string) { return url; },
  guardar(uriOrigem: string, _nome: string) { return uriOrigem; },
};
