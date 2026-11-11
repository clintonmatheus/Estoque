import type { Anexo, Funcionario, Item, Local, Movimento } from '../domain/tipos';

export const TABELAS = ['itens', 'locais', 'funcionarios', 'movimentos', 'anexos'] as const;
export type Tabela = (typeof TABELAS)[number];

export interface Documentos {
  itens: Item;
  locais: Local;
  funcionarios: Funcionario;
  movimentos: Movimento;
  anexos: Anexo;
}

/** Coleção de documentos com `id` (todos guardados por completo). */
export interface Colecao<T extends { id: string }> {
  salvar(doc: T): Promise<void>;
  obter(id: string): Promise<T | undefined>;
  listar(): Promise<T[]>;
}

export interface Pendencia { tabela: Tabela; id: string }

/** Alterações locais ainda não enviadas ao servidor. */
export interface FilaEnvio {
  adicionar(tabela: Tabela, id: string): Promise<void>;
  listar(): Promise<Pendencia[]>;
  remover(tabela: Tabela, id: string): Promise<void>;
  contem(tabela: Tabela, id: string): Promise<boolean>;
}

/** Último ponto (horário do servidor) já baixado de cada tabela. */
export interface Cursores {
  obter(tabela: string): Promise<string | undefined>;
  definir(tabela: string, valor: string): Promise<void>;
}

export type Armazenamento = { [K in Tabela]: Colecao<Documentos[K]> } & { fila: FilaEnvio; cursores: Cursores };
