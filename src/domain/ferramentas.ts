import type { Emprestimo, Movimento } from './tipos';

const DIA_MS = 86_400_000;
const dia = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

/** Dias entre duas datas AAAA-MM-DD (positivo se `ate` é depois de `de`). */
export const diasEntre = (de: string, ate: string) => Math.round((dia(ate) - dia(de)) / DIA_MS);

/** Ferramenta que está fora do galpão: não devolvida e não cancelada. */
export const emprestimoAberto = (e: Emprestimo) => !e.devolvidoEm && !e.cancelado;
export const emprestimosAbertos = (es: Emprestimo[]) => es.filter(emprestimoAberto);

/** Atrasado só a partir do dia seguinte à data prevista. */
export const atrasado = (e: Emprestimo, hoje: string) => emprestimoAberto(e) && hoje > e.prevista;
export const diasDeAtraso = (e: Emprestimo, hoje: string) => (atrasado(e, hoje) ? diasEntre(e.prevista, hoje) : 0);

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
