// Restauração a partir de uma cópia (pasta já descriptografada e descompactada).
//
//   node scripts/backup/restaurar.mjs sql <pasta> [tabela …] > restaurar.sql
//     Gera um SQL para rodar no SQL Editor do Supabase (ou no psql). Grava por cima (mesmo id) e não apaga nada.
//     Os gatilhos de proteção ficam desligados só durante a restauração (session_replication_role = replica).
//   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node scripts/backup/restaurar.mjs arquivos <pasta>
//     Envia de volta os arquivos anexados (fotos, PDFs, XML).
//
// Perfis (papel de cada pessoa) só são restaurados para logins que existem; crie os logins antes (usuarios.json lista os e-mails).
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { BUCKET, TABELAS, caminhoSeguro } from './backup.mjs';

const lit = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const jsonb = (v) => (v === null || v === undefined ? 'null' : `${lit(JSON.stringify(v))}::jsonb`);

/** SQL de restauração das tabelas pedidas (todas, por padrão, menos a auditoria). */
export async function gerarSql(pasta, tabelas = TABELAS.filter((t) => t !== 'auditoria')) {
  const partes = ['-- Restauração gerada por scripts/backup/restaurar.mjs', 'begin;', 'set local session_replication_role = replica;'];
  for (const t of tabelas) {
    let linhas;
    try { linhas = JSON.parse(await readFile(join(pasta, 'dados', `${t}.json`), 'utf8')); } catch { continue; }
    if (!linhas.length) continue;
    partes.push(`-- ${t}: ${linhas.length}`);
    if (t === 'perfis') {
      for (const p of linhas) {
        partes.push(`insert into public.perfis (id, nome, papel, financeiro, paga) select ${lit(p.id)}::uuid, ${lit(p.nome)}, ${lit(p.papel)}, ${lit(p.financeiro)}, ${p.paga ? 'true' : 'false'}`
          + ` where exists (select 1 from auth.users where id = ${lit(p.id)}::uuid)`
          + ' on conflict (id) do update set nome = excluded.nome, papel = excluded.papel, financeiro = excluded.financeiro, paga = excluded.paga;');
      }
      continue;
    }
    for (let i = 0; i < linhas.length; i += 500) {
      const valores = linhas.slice(i, i + 500).map((l) => `(${lit(l.id)}, ${jsonb(l.dados)}, ${l.servidor_em ? `${lit(l.servidor_em)}::timestamptz` : 'now()'})`);
      partes.push(`insert into public.${t} (id, dados, servidor_em) values\n${valores.join(',\n')}\non conflict (id) do update set dados = excluded.dados, servidor_em = excluded.servidor_em;`);
    }
  }
  partes.push('commit;');
  return `${partes.join('\n')}\n`;
}

async function arquivosDaPasta(pasta) {
  const r = [];
  for (const nome of await readdir(pasta).catch(() => [])) {
    const c = join(pasta, nome);
    if ((await stat(c)).isDirectory()) r.push(...(await arquivosDaPasta(c))); else r.push(c);
  }
  return r;
}

/** Envia os arquivos de volta ao bucket (substitui se já existir). */
export async function restaurarArquivos(sb, pasta) {
  const base = join(pasta, 'arquivos');
  let n = 0;
  for (const c of await arquivosDaPasta(base)) {
    const caminho = relative(base, c).split('\\').join('/');
    if (!caminhoSeguro(caminho)) continue;
    const { error } = await sb.storage.from(BUCKET).upload(caminho, await readFile(c), { upsert: true });
    if (error) throw new Error(`${caminho}: ${error.message}`);
    n += 1;
  }
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [modo, pasta, ...tabelas] = process.argv.slice(2);
  if (modo === 'sql' && pasta) process.stdout.write(await gerarSql(pasta, tabelas.length ? tabelas : undefined));
  else if (modo === 'arquivos' && pasta) {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    console.log(`${await restaurarArquivos(sb, pasta)} arquivos enviados.`);
  } else { console.error('Uso: restaurar.mjs sql <pasta> [tabelas…]  |  restaurar.mjs arquivos <pasta>'); process.exit(1); }
}
