import { diasEntre } from './epi';
import type { Bem, MovimentoBem, Posse } from './tipos';

export interface PosseComQuantidade { posse: Posse; quantidade: number }

/** Identifica uma posse (mesma pessoa na mesma obra = mesma posse). */
export const chavePosse = (p: Posse) => (p.tipo === 'campo' ? `campo|${p.funcionarioId}|${p.localId}` : p.tipo);
export const mesmaPosse = (a: Posse, b: Posse) => chavePosse(a) === chavePosse(b);

const ordem = (a: MovimentoBem, b: MovimentoBem) => a.data.localeCompare(b.data) || a.criado.em.localeCompare(b.criado.em) || a.id.localeCompare(b.id);
const ativos = (movs: MovimentoBem[], bemId?: string) => movs.filter((m) => !m.cancelado && (!bemId || m.bemId === bemId)).sort(ordem);

/** Reproduz os lançamentos em ordem de data e devolve os saldos e os lançamentos que tiraram mais do que havia. */
function reproduzir(movs: MovimentoBem[]) {
  const saldos = new Map<string, Map<string, PosseComQuantidade>>();
  const problemas = new Set<string>();
  for (const m of ativos(movs)) {
    const porBem = saldos.get(m.bemId) ?? new Map<string, PosseComQuantidade>();
    saldos.set(m.bemId, porBem);
    if (m.origem.tipo !== 'externo') {
      const k = chavePosse(m.origem);
      const atual = porBem.get(k) ?? { posse: m.origem, quantidade: 0 };
      if (atual.quantidade < m.quantidade) problemas.add(m.id);
      porBem.set(k, { posse: m.origem, quantidade: atual.quantidade - m.quantidade });
    }
    if (m.destino.tipo !== 'externo') {
      const k = chavePosse(m.destino);
      const atual = porBem.get(k) ?? { posse: m.destino, quantidade: 0 };
      porBem.set(k, { posse: m.destino, quantidade: atual.quantidade + m.quantidade });
    }
  }
  return { saldos, problemas };
}

/** Lançamentos que deixariam alguma posse negativa. */
export const problemasDeBens = (movs: MovimentoBem[]) => reproduzir(movs).problemas;

const RANK = { galpao: 0, campo: 1, externo: 2 } as const;

/** Onde estão as peças de um bem agora (galpão primeiro, depois obras). Só posses com quantidade. */
export function posicoesDoBem(movs: MovimentoBem[], bemId: string): PosseComQuantidade[] {
  const porBem = reproduzir(movs.filter((m) => m.bemId === bemId)).saldos.get(bemId);
  return [...(porBem?.values() ?? [])]
    .filter((p) => p.quantidade > 0)
    .sort((a, b) => RANK[a.posse.tipo] - RANK[b.posse.tipo] || chavePosse(a.posse).localeCompare(chavePosse(b.posse)));
}

export const totalDoBem = (movs: MovimentoBem[], bemId: string) => posicoesDoBem(movs, bemId).reduce((t, p) => t + p.quantidade, 0);

/** Prazo de devolução de uma ferramenta que está em campo, vindo da última movimentação que a levou para lá. */
export function emPrazo(movs: MovimentoBem[], bemId: string, hoje: string): { prevista: string; atraso: number } | undefined {
  const atual = posicoesDoBem(movs, bemId).find((p) => p.posse.tipo === 'campo');
  if (!atual) return undefined;
  const chegada = ativos(movs, bemId).filter((m) => mesmaPosse(m.destino, atual.posse)).pop();
  if (!chegada?.prevista) return undefined;
  return { prevista: chegada.prevista, atraso: Math.max(0, diasEntre(chegada.prevista, hoje)) };
}

export type SituacaoLocacao = 'vencida' | 'vence' | 'ok';

/** Prazo do contrato de locação (só enquanto ainda há peças em mãos). `dias` negativo = já venceu. */
export function situacaoLocacao(bem: Bem, total: number, hoje: string, janela = 7): { situacao: SituacaoLocacao; dias: number } | undefined {
  const fim = bem.tipo === 'locado' ? bem.locacao?.prevista : undefined;
  if (!fim || total <= 0) return undefined;
  const dias = diasEntre(hoje, fim);
  return { situacao: dias < 0 ? 'vencida' : dias <= janela ? 'vence' : 'ok', dias };
}

/** Peças em obras diferentes daquela em que a locadora cobra o equipamento. */
export function divergenciasDeCobranca(bem: Bem, posicoes: PosseComQuantidade[]): { localId: string; quantidade: number }[] {
  const cobrada = bem.tipo === 'locado' ? bem.locacao?.localCobrancaId : undefined;
  if (!cobrada) return [];
  const porObra = new Map<string, number>();
  for (const p of posicoes) {
    if (p.posse.tipo === 'campo' && p.posse.localId !== cobrada) porObra.set(p.posse.localId, (porObra.get(p.posse.localId) ?? 0) + p.quantidade);
  }
  return [...porObra].map(([localId, quantidade]) => ({ localId, quantidade }));
}
