import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Anexo, Papel, Usuario } from '../domain/tipos';
import type { Autenticacao, SaldoSimples } from '../auth/autenticacao';
import { SUPABASE_CHAVE_PUBLICA, SUPABASE_URL } from '../config';
import { TABELAS, type Documentos, type Tabela } from '../storage/contrato';
import { arquivos } from './arquivos';
import type { Lote, Remoto } from './remoto';

// Adaptadores reais (dependem de rede e do aparelho; a lógica testada fica no Sincronizador).

if (Platform.OS !== 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('expo-sqlite/localStorage/install');
}

export function criarClienteSupabase(): SupabaseClient {
  const sb = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
    auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (s) => {
      if (s === 'active') sb.auth.startAutoRefresh();
      else sb.auth.stopAutoRefresh();
    });
  }
  return sb;
}

/** Margem para não perder gravações que o servidor confirmou fora de ordem. */
const SOBREPOSICAO_MS = 60_000;
const PAGINA = 500;

function erroDeRede(e: unknown): Error {
  const msg = (e as Error)?.message ?? '';
  if (/fetch|network|timeout/i.test(msg)) return new Error('Sem conexão');
  if (/row-level security|permission/i.test(msg)) return new Error('Sem permissão no servidor');
  return new Error(msg || 'Falha no servidor');
}

export class RemotoSupabase implements Remoto {
  constructor(private sb: SupabaseClient) {}

  async enviar<K extends Tabela>(tabela: K, doc: Documentos[K]) {
    const dados = tabela === 'anexos' ? { ...doc, uri: '' } : doc;
    const { error } = await this.sb.from(tabela).upsert({ id: doc.id, dados }, { onConflict: 'id' });
    if (error) throw erroDeRede(error);
  }

  async baixar<K extends Tabela>(tabela: K, cursor?: string): Promise<Lote<Documentos[K]>> {
    const desde = cursor ? new Date(Date.parse(cursor) - SOBREPOSICAO_MS).toISOString() : '1970-01-01T00:00:00Z';
    const itens: Documentos[K][] = [];
    let ultimo = cursor;
    for (let pagina = 0; ; pagina++) {
      const { data, error } = await this.sb.from(tabela).select('dados, servidor_em')
        .gt('servidor_em', desde).order('servidor_em', { ascending: true })
        .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
      if (error) throw erroDeRede(error);
      for (const l of data ?? []) {
        itens.push(l.dados as Documentos[K]);
        if (!ultimo || l.servidor_em > ultimo) ultimo = l.servidor_em;
      }
      if (!data || data.length < PAGINA) break;
    }
    return { itens, cursor: ultimo };
  }

  async enviarArquivo(a: Anexo) {
    const caminho = `${a.grupo}/${a.id}.jpg`;
    const { error } = await this.sb.storage.from('anexos').upload(caminho, await arquivos.ler(a.uri), { contentType: 'image/jpeg', upsert: true });
    if (error) throw erroDeRede(error);
    return caminho;
  }

  async baixarArquivo(a: Anexo) {
    if (!a.caminhoRemoto) throw new Error('Foto sem arquivo no servidor');
    const { data, error } = await this.sb.storage.from('anexos').createSignedUrl(a.caminhoRemoto, 3600);
    if (error || !data) throw erroDeRede(error);
    return arquivos.baixar(data.signedUrl, `${a.id}.jpg`);
  }

  aoMudar(callback: () => void) {
    const canal = this.sb.channel('estoque-mudancas');
    for (const table of TABELAS) canal.on('postgres_changes', { event: '*', schema: 'public', table }, () => callback());
    canal.subscribe();
    return () => { void this.sb.removeChannel(canal); };
  }

  /** Saldos sem valores (consultor). */
  async saldos(): Promise<SaldoSimples[]> {
    const { data, error } = await this.sb.rpc('saldos');
    if (error) throw erroDeRede(error);
    return (data ?? []).map((l: Record<string, unknown>) => ({
      itemId: l.item_id as string, nome: l.nome as string, unidade: l.unidade as string,
      embalagem: (l.embalagem as SaldoSimples['embalagem']) ?? undefined,
      estoqueMinimo: Number(l.estoque_minimo), saldo: Number(l.saldo),
    }));
  }
}

const CHAVE_PERFIL = 'estoque.perfil';

export class AutenticacaoSupabase implements Autenticacao {
  constructor(private sb: SupabaseClient) {}

  async usuarioAtual(): Promise<Usuario | undefined> {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return undefined;
    const guardado = localStorage.getItem(CHAVE_PERFIL);
    if (guardado) {
      const u = JSON.parse(guardado) as Usuario;
      if (u.id === data.session.user.id && u.papel) return u;
    }
    try { return await this.carregarPerfil(data.session.user.id); } catch { return undefined; }
  }

  async entrar(email: string, senha: string): Promise<Usuario> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error || !data.user) {
      if (error && /invalid login|credentials/i.test(error.message)) throw new Error('E-mail ou senha incorretos');
      throw erroDeRede(error);
    }
    return this.carregarPerfil(data.user.id);
  }

  async sair() {
    localStorage.removeItem(CHAVE_PERFIL);
    await this.sb.auth.signOut();
  }

  async atualizarPerfil(): Promise<Usuario | undefined> {
    const { data } = await this.sb.auth.getSession();
    if (!data.session) return undefined;
    try { return await this.carregarPerfil(data.session.user.id); } catch { return undefined; }
  }

  private async carregarPerfil(id: string): Promise<Usuario> {
    const { data, error } = await this.sb.from('perfis').select('id, nome, papel').eq('id', id).single();
    if (error || !data) throw erroDeRede(error);
    const u: Usuario = { id: data.id, nome: data.nome, papel: data.papel as Papel };
    localStorage.setItem(CHAVE_PERFIL, JSON.stringify(u));
    return u;
  }
}
