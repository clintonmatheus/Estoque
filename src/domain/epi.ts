import { ordenarMovimentos } from './estoque';
import { ehEpi, type Item, type Movimento } from './tipos';

/** Item de EPI com lista de tamanhos: o saldo é controlado por tamanho (entrada, entrega e inventário). */
export const controlaTamanho = (i: Pick<Item, 'categoria' | 'tamanhos'>) => ehEpi(i) && !!i.tamanhos?.length;

/** Forma única de escrever o tamanho ("g " → "G", "40.0" → "40"). */
export const normalizarTamanho = (t?: string) => (t ?? '').trim().replace(/\.0+$/, '').toUpperCase();

/** Lê "38: 2; 39: 3; 40: 4" (também "38=2", "38 - 2"). Devolve undefined se não estiver nesse formato. */
export function lerSaldoPorTamanho(texto: string): { tamanho: string; quantidade: number }[] | undefined {
  const partes = texto.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
  if (!partes.length) return undefined;
  const r: { tamanho: string; quantidade: number }[] = [];
  for (const p of partes) {
    const m = p.match(/^(.+?)\s*[:=\-]\s*(\d+(?:[.,]\d+)?)$/);
    if (!m) return undefined;
    r.push({ tamanho: normalizarTamanho(m[1]), quantidade: Number(m[2].replace(',', '.')) });
  }
  return r;
}

/** Quanto cada lançamento soma ao saldo do galpão (EPI não vai a frentes de serviço). */
const efeito = (m: Movimento) => (m.tipo === 'entrada' || m.tipo === 'devolucao' || m.tipo === 'ajuste' ? m.quantidade : m.tipo === 'saida' || m.tipo === 'epi' ? -m.quantidade : 0);

/** Saldo por item e tamanho ('' = lançado sem tamanho, de antes do controle por tamanho). */
export function saldosPorTamanho(movs: Movimento[], itemIds?: Set<string>): Map<string, Map<string, number>> {
  const r = new Map<string, Map<string, number>>();
  for (const m of movs) {
    if (m.cancelado || (itemIds && !itemIds.has(m.itemId))) continue;
    const porT = r.get(m.itemId) ?? new Map<string, number>();
    const t = normalizarTamanho(m.tamanho);
    porT.set(t, Math.round(((porT.get(t) ?? 0) + efeito(m)) * 1000) / 1000);
    r.set(m.itemId, porT);
  }
  return r;
}

export interface ProblemaTamanho { movimentoId: string; itemId: string; tamanho: string; disponivel: number }

/** Lançamentos que deixam algum tamanho com saldo negativo (refaz a história em ordem). */
export function problemasDeTamanho(movs: Movimento[], itemIds: Set<string>): ProblemaTamanho[] {
  const saldo = new Map<string, number>();
  const r: ProblemaTamanho[] = [];
  for (const m of ordenarMovimentos(movs)) {
    if (m.cancelado || !itemIds.has(m.itemId)) continue;
    const t = normalizarTamanho(m.tamanho);
    const k = `${m.itemId}|${t}`;
    const antes = saldo.get(k) ?? 0;
    const depois = Math.round((antes + efeito(m)) * 1000) / 1000;
    if (depois < -1e-9 && efeito(m) < 0) r.push({ movimentoId: m.id, itemId: m.itemId, tamanho: t, disponivel: Math.max(0, antes) });
    saldo.set(k, depois);
  }
  return r;
}

/** Texto curto do saldo por tamanho: "38: 2 · 39: 3 · 40: 4" (e "sem tamanho: N" quando houver). */
export function textoPorTamanho(i: Pick<Item, 'tamanhos'>, porT: Map<string, number> | undefined): string {
  const tamanhos = [...new Set([...(i.tamanhos ?? []).map(normalizarTamanho), ...[...(porT?.keys() ?? [])].filter(Boolean)])];
  const partes = tamanhos.map((t) => `${t}: ${porT?.get(t) ?? 0}`);
  const sem = porT?.get('') ?? 0;
  if (sem) partes.push(`sem tamanho: ${sem}`);
  return partes.join(' · ');
}

const DIA_MS = 86_400_000;
const dia = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

/** Dias entre duas datas AAAA-MM-DD (positivo se `ate` é depois de `de`). */
export const diasEntre = (de: string, ate: string) => Math.round((dia(ate) - dia(de)) / DIA_MS);

export interface EpiParaTrocar {
  movimento: Movimento;
  situacao: 'vencido' | 'vence';
  /** Dias até a troca (negativo: já passou). */
  dias: number;
}

/** Última entrega ativa de um item de EPI a um funcionário. */
export function ultimaEntregaPorFuncionario(movs: Movimento[], funcionarioId: string, itemId: string): Movimento | undefined {
  return movs
    .filter((m) => m.tipo === 'epi' && !m.cancelado && m.funcionarioId === funcionarioId && m.itemId === itemId)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criado.em.localeCompare(a.criado.em))[0];
}

/**
 * EPIs com troca vencida ou próxima (até `janela` dias). Vale só a última entrega de cada item por funcionário,
 * pois uma nova entrega substitui a anterior.
 */
export function epiParaTrocar(movs: Movimento[], hoje: string, janela = 30): EpiParaTrocar[] {
  const ultimas = new Map<string, Movimento>();
  for (const m of movs) {
    if (m.tipo !== 'epi' || m.cancelado || !m.funcionarioId) continue;
    const k = `${m.funcionarioId}|${m.itemId}`;
    const atual = ultimas.get(k);
    if (!atual || m.data > atual.data || (m.data === atual.data && m.criado.em > atual.criado.em)) ultimas.set(k, m);
  }
  return [...ultimas.values()]
    .filter((m) => m.validade)
    .map((m) => ({ movimento: m, dias: diasEntre(hoje, m.validade!) }))
    .filter((x) => x.dias <= janela)
    .map((x) => ({ ...x, situacao: (x.dias < 0 ? 'vencido' : 'vence') as EpiParaTrocar['situacao'] }))
    .sort((a, b) => a.dias - b.dias);
}
