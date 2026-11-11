import { DatabaseSync } from 'node:sqlite';
import { criarArmazenamentoMemoria } from './memoria';
import { abrirBanco, criarArmazenamentoSqlite, type BancoSql } from './sqlite';
import type { Armazenamento } from './contrato';

export function bancoNode(): BancoSql {
  const db = new DatabaseSync(':memory:');
  return {
    exec: async (sql) => { db.exec(sql); },
    executar: async (sql, params = []) => { db.prepare(sql).run(...params); },
    consultar: async (sql, params = []) => db.prepare(sql).all(...params) as any[],
  };
}

const quem = { id: 'u', nome: 'X', em: '2026-11-11T12:00:00.000Z' };

describe.each<[string, () => Promise<Armazenamento>]>([
  ['memória', async () => criarArmazenamentoMemoria()],
  ['sqlite', async () => criarArmazenamentoSqlite(await abrirBanco(bancoNode()))],
])('Armazenamento (%s)', (_n, novo) => {
  it('guarda, substitui e lista por tabela, sem misturar tabelas', async () => {
    const a = await novo();
    await a.locais.salvar({ id: 'x', nome: 'Riachuelo', centroCusto: 'RMG', ativo: true, criado: quem });
    await a.funcionarios.salvar({ id: 'x', nome: 'João', ativo: true, criado: quem });
    await a.locais.salvar({ id: 'x', nome: 'Riachuelo', centroCusto: 'RMG', ativo: false, criado: quem });
    expect(await a.locais.listar()).toHaveLength(1);
    expect((await a.locais.obter('x'))?.ativo).toBe(false);
    expect((await a.funcionarios.obter('x'))?.nome).toBe('João');
    expect(await a.itens.obter('x')).toBeUndefined();
  });
  it('fila sem duplicar, em ordem, e cursores', async () => {
    const a = await novo();
    await a.fila.adicionar('movimentos', '1');
    await a.fila.adicionar('itens', '2');
    await a.fila.adicionar('movimentos', '1');
    expect(await a.fila.listar()).toEqual([{ tabela: 'movimentos', id: '1' }, { tabela: 'itens', id: '2' }]);
    expect(await a.fila.contem('itens', '2')).toBe(true);
    await a.fila.remover('movimentos', '1');
    expect(await a.fila.listar()).toEqual([{ tabela: 'itens', id: '2' }]);
    await a.cursores.definir('itens', 'c1');
    expect(await a.cursores.obter('itens')).toBe('c1');
  });
});

it('migração idempotente', async () => {
  const b = bancoNode();
  await abrirBanco(b);
  await expect(abrirBanco(b)).resolves.toBe(b);
});
