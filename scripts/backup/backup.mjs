// Cópia completa dos dados do app (tabelas, perfis, logins e arquivos anexados).
// Uso (na tarefa agendada do GitHub): SUPABASE_URL=… SUPABASE_SERVICE_KEY=… node scripts/backup/backup.mjs <pasta-de-saída>
// A chave secreta (service role) só existe nos "Secrets" do GitHub; nunca vai para o app nem para o código.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const TABELAS = ['perfis', 'itens', 'locais', 'funcionarios', 'movimentos', 'anexos', 'bens', 'movimentos_bens',
  'empresas', 'contas', 'centros', 'fornecedores', 'tipos_despesa', 'encargos', 'pedidos', 'compras', 'auditoria'];
export const BUCKET = 'anexos';
const PAGINA = 1000;

const tabelaInexistente = (e) => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|Could not find the table/i.test(e.message ?? ''));

/** Todas as linhas de uma tabela, em páginas. Tabela que ainda não existe devolve null. */
export async function exportarTabela(sb, tabela) {
  const linhas = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await sb.from(tabela).select('*').order('id', { ascending: true }).range(de, de + PAGINA - 1);
    if (error) { if (tabelaInexistente(error)) return null; throw new Error(`${tabela}: ${error.message}`); }
    linhas.push(...data);
    if (data.length < PAGINA) return linhas;
  }
}

/** Caminho de arquivo do bucket que pode virar caminho no disco: sem "..", sem barra no início e sem "\\". */
export function caminhoSeguro(caminho) {
  const partes = String(caminho).split('/');
  return caminho.length > 0 && !caminho.startsWith('/') && !caminho.includes('\\')
    && partes.every((p) => p !== '' && p !== '.' && p !== '..');
}

/** Caminhos de todos os arquivos do bucket (as "pastas" são o id do lançamento, do pedido ou da compra). */
export async function listarArquivos(sb, prefixo = '') {
  const caminhos = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefixo, { limit: PAGINA, offset: de, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`arquivos: ${error.message}`);
    for (const x of data) {
      const caminho = prefixo ? `${prefixo}/${x.name}` : x.name;
      if (!caminhoSeguro(caminho)) continue; // nome que sairia da pasta do backup: não segue nem grava
      if (x.id === null || x.id === undefined) caminhos.push(...(await listarArquivos(sb, caminho))); // pasta
      else caminhos.push(caminho);
    }
    if (data.length < PAGINA) return caminhos;
  }
}

/** Logins (e-mail e datas). Senhas não são exportáveis: numa restauração, cada pessoa recebe senha nova. */
export async function exportarUsuarios(sb) {
  const r = [];
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await sb.auth.admin.listUsers({ page: pagina, perPage: PAGINA });
    if (error) throw new Error(`logins: ${error.message}`);
    r.push(...data.users.map((u) => ({ id: u.id, email: u.email, criado_em: u.created_at, ultimo_acesso: u.last_sign_in_at ?? null })));
    if (data.users.length < PAGINA) return r;
  }
}

async function gravar(caminho, conteudo) {
  await mkdir(dirname(caminho), { recursive: true });
  await writeFile(caminho, conteudo);
}

/** Faz a cópia em `pasta` e devolve o resumo (só contagens: os registros nunca vão para o log). */
export async function fazerBackup(sb, pasta, agora = new Date()) {
  const resumo = { feito_em: agora.toISOString(), tabelas: {}, ausentes: [], usuarios: 0, arquivos: 0, bytes_arquivos: 0 };
  for (const t of TABELAS) {
    const linhas = await exportarTabela(sb, t);
    if (linhas === null) { resumo.ausentes.push(t); continue; }
    resumo.tabelas[t] = linhas.length;
    await gravar(join(pasta, 'dados', `${t}.json`), JSON.stringify(linhas));
  }
  const usuarios = await exportarUsuarios(sb);
  resumo.usuarios = usuarios.length;
  await gravar(join(pasta, 'usuarios.json'), JSON.stringify(usuarios, null, 1));
  for (const caminho of await listarArquivos(sb)) {
    if (!caminhoSeguro(caminho)) continue;
    const { data, error } = await sb.storage.from(BUCKET).download(caminho);
    if (error) throw new Error(`arquivo ${caminho}: ${error.message}`);
    const bytes = Buffer.from(await data.arrayBuffer());
    await gravar(join(pasta, 'arquivos', caminho), bytes);
    resumo.arquivos += 1;
    resumo.bytes_arquivos += bytes.length;
  }
  await gravar(join(pasta, 'resumo.json'), JSON.stringify(resumo, null, 1));
  return resumo;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pasta = process.argv[2] ?? 'backup';
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !chave) { console.error('Faltam SUPABASE_URL ou SUPABASE_SERVICE_KEY (Settings → Secrets and variables → Actions).'); process.exit(1); }
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await fazerBackup(sb, pasta);
  console.log(`Backup feito: ${Object.entries(r.tabelas).map(([t, n]) => `${t} ${n}`).join(', ')}; ${r.usuarios} logins; ${r.arquivos} arquivos (${(r.bytes_arquivos / 1e6).toFixed(1)} MB).`);
  if (r.ausentes.length) console.log(`Tabelas ainda não criadas: ${r.ausentes.join(', ')}`);
}
