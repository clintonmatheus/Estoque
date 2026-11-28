import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { caminhoSeguro, fazerBackup, TABELAS } from './backup.mjs';
import { access } from 'node:fs/promises';
import { gerarSql } from './restaurar.mjs';

/** Supabase de mentira: tabelas em memória, um bucket com pastas, logins. */
function falso({ tabelas, arquivos, usuarios }) {
  return {
    from: (t) => ({
      select: () => ({ order: () => ({ range: async (de, ate) => (t in tabelas
        ? { data: tabelas[t].slice(de, ate + 1), error: null }
        : { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }) }) }),
    }),
    storage: { from: () => ({
      list: async (prefixo, { offset }) => {
        if (offset) return { data: [], error: null };
        const nomes = new Map();
        for (const c of Object.keys(arquivos)) {
          if (prefixo && !c.startsWith(`${prefixo}/`)) continue;
          const resto = prefixo ? c.slice(prefixo.length + 1) : c;
          const [primeiro, ...mais] = resto.split('/');
          nomes.set(primeiro, mais.length ? { name: primeiro, id: null } : { name: primeiro, id: 'x' });
        }
        return { data: [...nomes.values()], error: null };
      },
      download: async (c) => ({ data: new Blob([arquivos[c]]), error: null }),
    }) },
    auth: { admin: { listUsers: async ({ page }) => ({ data: { users: page === 1 ? usuarios : [] }, error: null }) } },
  };
}

test('backup grava todas as tabelas, logins e arquivos (com pastas), e ignora tabela ainda não criada', async () => {
  const pedidos = Array.from({ length: 2500 }, (_, i) => ({ id: `p${String(i).padStart(4, '0')}`, dados: { status: 'pago', descricao: "Pedido d'água" }, servidor_em: '2026-11-25T10:00:00Z' }));
  const tabelas = Object.fromEntries(TABELAS.filter((t) => t !== 'auditoria').map((t) => [t, []]));
  tabelas.pedidos = pedidos;
  tabelas.perfis = [{ id: '00000000-0000-0000-0000-000000000001', nome: 'Joana', papel: 'controle', financeiro: 'pagador', paga: true }];
  const sb = falso({ tabelas, arquivos: { 'p0001/a1.pdf': '%PDF', 'm9/a2.jpg': 'JPG' }, usuarios: [{ id: 'u1', email: 'joana@x.com', created_at: '2026-01-01' }] });
  const pasta = await mkdtemp(join(tmpdir(), 'bk-'));
  const r = await fazerBackup(sb, pasta, new Date('2026-11-26T06:17:00Z'));
  assert.equal(r.tabelas.pedidos, 2500);
  assert.deepEqual(r.ausentes, ['auditoria']);
  assert.equal(r.usuarios, 1);
  assert.equal(r.arquivos, 2);
  assert.equal(await readFile(join(pasta, 'arquivos', 'p0001', 'a1.pdf'), 'utf8'), '%PDF');
  assert.equal(JSON.parse(await readFile(join(pasta, 'dados', 'pedidos.json'), 'utf8')).length, 2500);

  const sql = await gerarSql(pasta);
  assert.match(sql, /set local session_replication_role = replica;/);
  assert.match(sql, /Pedido d''água/); // aspas escapadas
  assert.equal((sql.match(/insert into public\.pedidos/g) ?? []).length, 5); // lotes de 500
  assert.match(sql, /insert into public\.perfis .* where exists \(select 1 from auth\.users/);
  assert.match(sql, /commit;\n$/);
});

test('backup não grava fora da pasta quando o nome do arquivo tem ".."', async () => {
  const tabelas = Object.fromEntries(TABELAS.map((t) => [t, []]));
  const sb = falso({ tabelas, arquivos: { '../../fora.txt': 'X', 'p1/../../fora2.txt': 'Y', 'p1/ok.pdf': '%PDF' }, usuarios: [] });
  const raiz = await mkdtemp(join(tmpdir(), 'bk-'));
  const pasta = join(raiz, 'a', 'b');
  const r = await fazerBackup(sb, pasta);
  assert.equal(r.arquivos, 1);
  await assert.rejects(access(join(raiz, 'fora.txt')));
  await assert.rejects(access(join(pasta, 'fora2.txt')));
  assert.equal(caminhoSeguro('p1/ok.pdf'), true);
  for (const c of ['', '/x', '..', 'a/../b', 'a//b', 'a\\b']) assert.equal(caminhoSeguro(c), false, c);
});

test('abrir.mjs descriptografa o que o openssl da tarefa agendada gera', async () => {
  const { execFileSync } = await import('node:child_process');
  const { writeFile } = await import('node:fs/promises');
  const { descriptografar } = await import('./abrir.mjs');
  const pasta = await mkdtemp(join(tmpdir(), 'enc-'));
  await writeFile(join(pasta, 'x.tar.gz'), 'conteúdo da cópia');
  execFileSync('openssl', ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-salt', '-in', join(pasta, 'x.tar.gz'), '-out', join(pasta, 'x.enc'), '-pass', 'pass:senha forte 123']);
  const bytes = await readFile(join(pasta, 'x.enc'));
  assert.equal(descriptografar(bytes, 'senha forte 123').toString(), 'conteúdo da cópia');
  assert.throws(() => descriptografar(bytes, 'errada'), /Senha errada/);
});
