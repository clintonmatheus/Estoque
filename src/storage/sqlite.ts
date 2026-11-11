import { TABELAS, type Armazenamento, type Colecao, type Cursores, type FilaEnvio, type Pendencia, type Tabela } from './contrato';

/** Abstração mínima de banco SQL: o app usa expo-sqlite; os testes usam node:sqlite. */
export interface BancoSql {
  exec(sql: string): Promise<void>;
  executar(sql: string, params?: (string | number | null)[]): Promise<void>;
  consultar<T = Record<string, unknown>>(sql: string, params?: (string | number | null)[]): Promise<T[]>;
}

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS documentos (tabela TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (tabela, id));
CREATE TABLE IF NOT EXISTS fila_envio (seq INTEGER PRIMARY KEY AUTOINCREMENT, tabela TEXT NOT NULL, id TEXT NOT NULL, UNIQUE (tabela, id));
CREATE TABLE IF NOT EXISTS cursores (tabela TEXT PRIMARY KEY, valor TEXT NOT NULL);
`;

export async function abrirBanco(banco: BancoSql): Promise<BancoSql> {
  await banco.exec(ESQUEMA);
  return banco;
}

type Linha = { json: string };

export class ColecaoSqlite<T extends { id: string }> implements Colecao<T> {
  constructor(private banco: BancoSql, private tabela: Tabela) {}
  async salvar(d: T) {
    await this.banco.executar('INSERT OR REPLACE INTO documentos (tabela, id, json) VALUES (?, ?, ?)', [this.tabela, d.id, JSON.stringify(d)]);
  }
  async obter(id: string) {
    const [l] = await this.banco.consultar<Linha>('SELECT json FROM documentos WHERE tabela = ? AND id = ?', [this.tabela, id]);
    return l ? (JSON.parse(l.json) as T) : undefined;
  }
  async listar() {
    return (await this.banco.consultar<Linha>('SELECT json FROM documentos WHERE tabela = ?', [this.tabela])).map((l) => JSON.parse(l.json) as T);
  }
}

export class FilaEnvioSqlite implements FilaEnvio {
  constructor(private banco: BancoSql) {}
  async adicionar(tabela: Tabela, id: string) { await this.banco.executar('INSERT OR IGNORE INTO fila_envio (tabela, id) VALUES (?, ?)', [tabela, id]); }
  async listar() { return this.banco.consultar<Pendencia>('SELECT tabela, id FROM fila_envio ORDER BY seq'); }
  async remover(tabela: Tabela, id: string) { await this.banco.executar('DELETE FROM fila_envio WHERE tabela = ? AND id = ?', [tabela, id]); }
  async contem(tabela: Tabela, id: string) {
    return (await this.banco.consultar('SELECT 1 FROM fila_envio WHERE tabela = ? AND id = ?', [tabela, id])).length > 0;
  }
}

export class CursoresSqlite implements Cursores {
  constructor(private banco: BancoSql) {}
  async obter(t: string) {
    const [l] = await this.banco.consultar<{ valor: string }>('SELECT valor FROM cursores WHERE tabela = ?', [t]);
    return l?.valor;
  }
  async definir(t: string, v: string) { await this.banco.executar('INSERT OR REPLACE INTO cursores (tabela, valor) VALUES (?, ?)', [t, v]); }
}

export function criarArmazenamentoSqlite(banco: BancoSql): Armazenamento {
  const a: Record<string, unknown> = { fila: new FilaEnvioSqlite(banco), cursores: new CursoresSqlite(banco) };
  for (const t of TABELAS) a[t] = new ColecaoSqlite(banco, t);
  return a as Armazenamento;
}
