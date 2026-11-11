import * as SQLite from 'expo-sqlite';
import { abrirBanco, type BancoSql } from './sqlite';

/** Adaptador do expo-sqlite para BancoSql (não coberto por testes: depende do dispositivo). */
export async function abrirBancoDoApp(): Promise<BancoSql> {
  const db = await SQLite.openDatabaseAsync('estoque-v1.db');
  return abrirBanco({
    exec: (sql) => db.execAsync(sql),
    executar: async (sql, params = []) => { await db.runAsync(sql, params); },
    consultar: (sql, params = []) => db.getAllAsync(sql, params) as Promise<any>,
  });
}
