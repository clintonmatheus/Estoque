import type { Anexo } from '../domain/tipos';
import { TABELAS, type Armazenamento, type Colecao, type Tabela } from '../storage/contrato';
import type { Remoto } from './remoto';

export interface ResultadoSync { enviados: number; recebidos: number }

/**
 * Sincronização "offline primeiro":
 * 1. envia a fila de alterações locais (anexos: arquivo antes dos dados);
 * 2. baixa o que mudou no servidor desde o último cursor, sem sobrescrever alterações locais ainda pendentes;
 * 3. baixa arquivos de fotos que ainda não estão no aparelho.
 */
export class Sincronizador {
  private emAndamento?: Promise<ResultadoSync>;

  constructor(private a: Armazenamento, private remoto: Remoto) {}

  sincronizar(): Promise<ResultadoSync> {
    if (!this.emAndamento) this.emAndamento = this.executar().finally(() => { this.emAndamento = undefined; });
    return this.emAndamento;
  }

  private colecao(t: Tabela) { return this.a[t] as unknown as Colecao<{ id: string }>; }

  private async executar(): Promise<ResultadoSync> {
    let enviados = 0;
    let recusa: Error | undefined;
    try {
      enviados = await this.enviar();
    } catch (e) {
      if ((e as Error).message === 'Sem conexão') throw e;
      recusa = e as Error; // ainda assim baixa o que os outros fizeram
    }
    let recebidos = 0;
    for (const t of TABELAS) recebidos += await this.receber(t);
    await this.baixarArquivos();
    if (recusa) throw recusa;
    return { enviados, recebidos };
  }

  private async enviar(): Promise<number> {
    let n = 0;
    let recusa: Error | undefined;
    for (const p of await this.a.fila.listar()) {
      try {
        let doc = await this.colecao(p.tabela).obter(p.id);
        if (doc && p.tabela === 'anexos') {
          const x = doc as Anexo;
          if (!x.caminhoRemoto && !x.excluido) {
            const comArquivo: Anexo = { ...x, caminhoRemoto: await this.remoto.enviarArquivo(x) };
            await this.a.anexos.salvar(comArquivo);
            doc = comArquivo;
          }
        }
        if (doc) await this.remoto.enviar(p.tabela, doc as never);
      } catch (e) {
        if ((e as Error).message === 'Sem conexão') throw e;
        // Recusado pelo servidor (ex.: sem permissão): descarta a alteração local e
        // força baixar a tabela de novo, para a cópia local voltar à versão do servidor.
        recusa = e as Error;
        await this.a.fila.remover(p.tabela, p.id);
        await this.a.cursores.definir(p.tabela, '');
        continue;
      }
      await this.a.fila.remover(p.tabela, p.id);
      n += 1;
    }
    if (recusa) throw recusa;
    return n;
  }

  private async receber(t: Tabela): Promise<number> {
    const lote = await this.remoto.baixar(t, (await this.a.cursores.obter(t)) || undefined);
    const col = this.colecao(t);
    let mudou = 0;
    for (const item of lote.itens as { id: string }[]) {
      if (await this.a.fila.contem(t, item.id)) continue; // alteração local pendente prevalece
      const local = await col.obter(item.id);
      // anexos: o endereço do arquivo é de cada aparelho
      const novo = t === 'anexos' ? { ...item, uri: (local as Anexo | undefined)?.uri ?? '' } : item;
      if (local && JSON.stringify(local) === JSON.stringify(novo)) continue;
      await col.salvar(novo);
      mudou += 1;
    }
    if (lote.cursor) await this.a.cursores.definir(t, lote.cursor);
    return mudou;
  }

  private async baixarArquivos(): Promise<void> {
    for (const x of await this.a.anexos.listar()) {
      if (x.excluido || x.uri || !x.caminhoRemoto) continue;
      try {
        await this.a.anexos.salvar({ ...x, uri: await this.remoto.baixarArquivo(x) });
      } catch {
        // tenta de novo na próxima sincronização
      }
    }
  }
}
