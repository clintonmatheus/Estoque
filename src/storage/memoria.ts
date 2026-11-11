import { TABELAS, type Armazenamento, type Colecao, type Cursores, type FilaEnvio, type Pendencia, type Tabela } from './contrato';

const clonar = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export class ColecaoMemoria<T extends { id: string }> implements Colecao<T> {
  private dados = new Map<string, T>();
  async salvar(d: T) { this.dados.set(d.id, clonar(d)); }
  async obter(id: string) { const d = this.dados.get(id); return d && clonar(d); }
  async listar() { return [...this.dados.values()].map(clonar); }
}

export class FilaEnvioMemoria implements FilaEnvio {
  private itens: Pendencia[] = [];
  async adicionar(tabela: Tabela, id: string) { if (!(await this.contem(tabela, id))) this.itens.push({ tabela, id }); }
  async listar() { return this.itens.map((p) => ({ ...p })); }
  async remover(tabela: Tabela, id: string) { this.itens = this.itens.filter((p) => !(p.tabela === tabela && p.id === id)); }
  async contem(tabela: Tabela, id: string) { return this.itens.some((p) => p.tabela === tabela && p.id === id); }
}

export class CursoresMemoria implements Cursores {
  private dados = new Map<string, string>();
  async obter(t: string) { return this.dados.get(t); }
  async definir(t: string, v: string) { this.dados.set(t, v); }
}

export function criarArmazenamentoMemoria(): Armazenamento {
  const a: Record<string, unknown> = { fila: new FilaEnvioMemoria(), cursores: new CursoresMemoria() };
  for (const t of TABELAS) a[t] = new ColecaoMemoria();
  return a as Armazenamento;
}
