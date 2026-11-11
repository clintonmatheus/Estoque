import type { Anexo } from '../domain/tipos';
import { TABELAS, type Documentos, type Tabela } from '../storage/contrato';
import type { Lote, Remoto } from './remoto';

type ComSeq = { item: { id: string }; seq: number };

/** Servidor em memória para testes: vários "aparelhos" podem compartilhar a mesma instância. */
export class RemotoFalso implements Remoto {
  falharEnvios = false;
  falharDownloads = false;
  /** Ids que o servidor recusa (simula regra de permissão). */
  recusar = new Set<string>();
  arquivosEnviados: string[] = [];
  private seq = 0;
  private tabelas = Object.fromEntries(TABELAS.map((t) => [t, new Map<string, ComSeq>()])) as Record<Tabela, Map<string, ComSeq>>;
  private ouvintes = new Set<() => void>();

  async enviar<K extends Tabela>(tabela: K, doc: Documentos[K]) {
    if (this.falharEnvios) throw new Error('Sem conexão');
    if (this.recusar.has(doc.id)) throw new Error('Sem permissão no servidor');
    const item = tabela === 'anexos' ? { ...doc, uri: '' } : doc;
    this.tabelas[tabela].set(doc.id, { item: JSON.parse(JSON.stringify(item)), seq: ++this.seq });
    this.ouvintes.forEach((o) => o());
  }

  async baixar<K extends Tabela>(tabela: K, cursor?: string): Promise<Lote<Documentos[K]>> {
    const desde = cursor ? Number(cursor) : 0;
    const novos = [...this.tabelas[tabela].values()].filter((x) => x.seq > desde).sort((a, b) => a.seq - b.seq);
    return {
      itens: novos.map((x) => JSON.parse(JSON.stringify(x.item))),
      cursor: novos.length ? String(novos[novos.length - 1].seq) : cursor,
    };
  }

  async enviarArquivo(a: Anexo) {
    if (this.falharEnvios) throw new Error('Sem conexão');
    this.arquivosEnviados.push(a.id);
    return `${a.grupo}/${a.id}.jpg`;
  }

  async baixarArquivo(a: Anexo) {
    if (this.falharDownloads) throw new Error('Sem conexão');
    return `file://baixadas/${a.id}.jpg`;
  }

  aoMudar(callback: () => void) {
    this.ouvintes.add(callback);
    return () => { this.ouvintes.delete(callback); };
  }
}
