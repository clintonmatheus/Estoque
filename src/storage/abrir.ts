import type { Armazenamento } from './contrato';
import { abrirBancoDoApp } from './expo';
import { criarArmazenamentoSqlite } from './sqlite';

/** Celular: banco no aparelho (funciona sem internet). A versão do navegador fica em abrir.web.ts. */
export async function abrirArmazenamento(): Promise<Armazenamento> {
  return criarArmazenamentoSqlite(await abrirBancoDoApp());
}
