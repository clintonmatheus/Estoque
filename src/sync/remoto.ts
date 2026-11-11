import type { Anexo } from '../domain/tipos';
import type { Documentos, Tabela } from '../storage/contrato';

/** Itens alterados no servidor desde um cursor; `cursor` é o novo ponto a guardar. */
export interface Lote<T> { itens: T[]; cursor?: string }

/** Servidor central. Implementações: Supabase (app) e RemotoFalso (testes). */
export interface Remoto {
  enviar<K extends Tabela>(tabela: K, doc: Documentos[K]): Promise<void>;
  baixar<K extends Tabela>(tabela: K, cursor?: string): Promise<Lote<Documentos[K]>>;
  /** Envia o arquivo da foto e devolve o caminho no servidor. */
  enviarArquivo(a: Anexo): Promise<string>;
  /** Baixa o arquivo para o aparelho e devolve o endereço local. */
  baixarArquivo(a: Anexo): Promise<string>;
  /** Avisa quando algo muda no servidor (tempo real). Devolve a função para cancelar. */
  aoMudar?(callback: () => void): () => void;
}
