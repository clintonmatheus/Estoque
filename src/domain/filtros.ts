import { CATEGORIAS } from './categorias';
import type { Embalagem } from './tipos';

/** Uma linha da lista de estoque (serve ao almoxarife e ao consultor). */
export interface LinhaSaldo {
  itemId: string;
  nome: string;
  unidade: string;
  embalagem?: Embalagem;
  estoqueMinimo: number;
  saldo: number;
  categoria: string;
  /** Só para quem vê valores. */
  valor?: number;
  /** Data (AAAA-MM-DD) da última saída para obra; undefined = nunca saiu. */
  ultimaSaida?: string;
}

export type Filtro = 'todos' | 'com-saldo' | 'zerados' | 'minimo' | 'parados' | `cat:${string}`;

export const DIAS_PARADO = 60;

export const abaixoDoMinimo = (l: LinhaSaldo) => l.estoqueMinimo > 0 && l.saldo <= l.estoqueMinimo;

function diasEntre(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export function aplicarFiltro(linhas: LinhaSaldo[], filtro: Filtro, hoje: string): LinhaSaldo[] {
  switch (filtro) {
    case 'todos': return linhas;
    case 'com-saldo': return linhas.filter((l) => l.saldo > 0);
    case 'zerados': return linhas.filter((l) => l.saldo <= 0);
    case 'minimo': return linhas.filter(abaixoDoMinimo);
    case 'parados': return linhas.filter((l) => l.saldo > 0 && (!l.ultimaSaida || diasEntre(l.ultimaSaida, hoje) >= DIAS_PARADO));
    default: return linhas.filter((l) => l.categoria === filtro.slice(4));
  }
}

export interface OpcaoFiltro { id: Filtro; titulo: string; quantidade: number }

/** Filtros prontos com a quantidade de itens em cada um (categorias vazias ficam de fora). */
export function opcoesDeFiltro(linhas: LinhaSaldo[], hoje: string, comParados: boolean): OpcaoFiltro[] {
  const base: [Filtro, string][] = [
    ['todos', 'Todos'], ['com-saldo', 'Com saldo'], ['zerados', 'Zerados'], ['minimo', 'Abaixo do mínimo'],
    ...(comParados ? [['parados', `Parados há ${DIAS_PARADO} dias`] as [Filtro, string]] : []),
  ];
  const categorias = [...CATEGORIAS, ...new Set(linhas.map((l) => l.categoria))]
    .filter((c, i, a) => a.indexOf(c) === i)
    .map((c) => [`cat:${c}` as Filtro, c] as [Filtro, string]);
  return [...base, ...categorias]
    .map(([id, titulo]) => ({ id, titulo, quantidade: aplicarFiltro(linhas, id, hoje).length }))
    .filter((o) => !o.id.startsWith('cat:') || o.quantidade > 0);
}
