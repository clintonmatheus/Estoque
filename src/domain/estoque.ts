import type { Periodo } from './datas';
import type { Movimento } from './tipos';

export interface Lote { quantidade: number; custo: number }
export interface SaldoItem { quantidade: number; valor: number; lotes: Lote[]; ultimoCusto: number }
export interface NoLocal { quantidade: number; valor: number }
/** Valor (R$) que o movimento tirou ou pôs no galpão / na frente de serviço. */
export interface CustoMovimento { valor: number; custoUnitario: number }
export interface Problema { movimentoId: string; itemId: string; localId?: string; disponivel: number }

export interface Posicao {
  itens: Record<string, SaldoItem>;
  custos: Record<string, CustoMovimento>;
  /** Material entregue a cada frente de serviço (líquido de devoluções e transferências). */
  locais: Record<string, Record<string, NoLocal>>;
  /** Saldo do galpão logo após cada movimento (para o histórico do item). */
  saldoApos: Record<string, number>;
  problemas: Problema[];
}

const EPS = 1e-9;

export function ordenarMovimentos(movs: Movimento[]): Movimento[] {
  return [...movs].sort((a, b) => a.data.localeCompare(b.data) || a.criado.em.localeCompare(b.criado.em) || a.id.localeCompare(b.id));
}

/** Retira `q` do galpão pelo PEPS; o que faltar sai pelo último custo (e gera problema). */
function consumir(s: SaldoItem, q: number): { valor: number; faltou: number } {
  let resta = q;
  let valor = 0;
  while (resta > EPS && s.lotes.length) {
    const l = s.lotes[0];
    const usa = Math.min(l.quantidade, resta);
    valor += usa * l.custo;
    l.quantidade -= usa;
    resta -= usa;
    if (l.quantidade <= EPS) s.lotes.shift();
  }
  const faltou = resta > EPS ? resta : 0;
  valor += faltou * s.ultimoCusto;
  s.quantidade -= q;
  s.valor = s.lotes.reduce((t, l) => t + l.quantidade * l.custo, 0);
  return { valor, faltou };
}

function acrescentar(s: SaldoItem, q: number, custo: number) {
  // Se o saldo estava negativo (lançamento fora de ordem), a entrada cobre primeiro o que faltou.
  const deficit = s.quantidade < 0 ? Math.min(-s.quantidade, q) : 0;
  if (q - deficit > EPS) s.lotes.push({ quantidade: q - deficit, custo });
  s.quantidade += q;
  s.ultimoCusto = custo;
  s.valor = s.lotes.reduce((t, l) => t + l.quantidade * l.custo, 0);
}

/**
 * Recalcula todo o estoque a partir dos lançamentos (PEPS: o primeiro que entra é o primeiro que sai).
 * `custoReferencia`: custo por item quando ainda não houve compra (ex.: contagem inicial).
 */
export function calcularPosicao(movs: Movimento[], custoReferencia: Record<string, number | undefined> = {}): Posicao {
  const p: Posicao = { itens: {}, custos: {}, locais: {}, saldoApos: {}, problemas: [] };
  const item = (id: string) => (p.itens[id] ??= { quantidade: 0, valor: 0, lotes: [], ultimoCusto: custoReferencia[id] ?? 0 });
  const noLocal = (localId: string, itemId: string) => ((p.locais[localId] ??= {})[itemId] ??= { quantidade: 0, valor: 0 });
  const tirarDoLocal = (mv: Movimento, localId: string): CustoMovimento => {
    const n = noLocal(localId, mv.itemId);
    const medio = n.quantidade > EPS ? n.valor / n.quantidade : item(mv.itemId).ultimoCusto;
    if (mv.quantidade > n.quantidade + EPS) {
      p.problemas.push({ movimentoId: mv.id, itemId: mv.itemId, localId, disponivel: Math.max(0, n.quantidade) });
    }
    const valor = mv.quantidade * medio;
    n.quantidade -= mv.quantidade;
    n.valor = n.quantidade > EPS ? n.valor - valor : 0;
    return { valor, custoUnitario: medio };
  };

  for (const mv of ordenarMovimentos(movs)) {
    if (mv.cancelado) continue;
    const s = item(mv.itemId);
    let custo: CustoMovimento;
    switch (mv.tipo) {
      case 'entrada': {
        const c = mv.custoUnitario ?? 0;
        acrescentar(s, mv.quantidade, c);
        custo = { valor: mv.quantidade * c, custoUnitario: c };
        break;
      }
      case 'saida': {
        const antes = s.quantidade;
        const { valor, faltou } = consumir(s, mv.quantidade);
        if (faltou) p.problemas.push({ movimentoId: mv.id, itemId: mv.itemId, disponivel: Math.max(0, antes) });
        custo = { valor, custoUnitario: valor / mv.quantidade };
        const n = noLocal(mv.localId ?? '', mv.itemId);
        n.quantidade += mv.quantidade;
        n.valor += valor;
        break;
      }
      case 'devolucao': {
        custo = tirarDoLocal(mv, mv.localId ?? '');
        acrescentar(s, mv.quantidade, custo.custoUnitario);
        break;
      }
      case 'transferencia': {
        custo = tirarDoLocal(mv, mv.localId ?? '');
        const d = noLocal(mv.localDestinoId ?? '', mv.itemId);
        d.quantidade += mv.quantidade;
        d.valor += custo.valor;
        break;
      }
      case 'ajuste': {
        if (mv.quantidade < 0) {
          const antes = s.quantidade;
          const { valor, faltou } = consumir(s, -mv.quantidade);
          if (faltou) p.problemas.push({ movimentoId: mv.id, itemId: mv.itemId, disponivel: Math.max(0, antes) });
          custo = { valor, custoUnitario: valor / -mv.quantidade };
        } else {
          const c = mv.custoUnitario ?? s.ultimoCusto;
          acrescentar(s, mv.quantidade, c);
          custo = { valor: mv.quantidade * c, custoUnitario: c };
        }
        break;
      }
    }
    p.custos[mv.id] = custo;
    p.saldoApos[mv.id] = s.quantidade;
  }
  return p;
}

const chave = (x: Problema) => `${x.movimentoId}|${x.localId ?? ''}`;

/** Problemas que existem depois da alteração e não existiam antes (usado para bloquear o lançamento). */
export function novosProblemas(antes: Movimento[], depois: Movimento[], custoReferencia?: Record<string, number | undefined>): Problema[] {
  const ja = new Set(calcularPosicao(antes, custoReferencia).problemas.map(chave));
  return calcularPosicao(depois, custoReferencia).problemas.filter((x) => !ja.has(chave(x)));
}

export interface GastoLocal { localId: string; itemId: string; quantidade: number; valor: number }

/** Material (quantidade e R$) destinado a cada frente de serviço no período. */
export function gastosPorLocal(movs: Movimento[], posicao: Posicao, periodo: Periodo): GastoLocal[] {
  const mapa = new Map<string, GastoLocal>();
  const somar = (localId: string | undefined, itemId: string, q: number, v: number) => {
    if (!localId) return;
    const k = `${localId}|${itemId}`;
    const g = mapa.get(k) ?? { localId, itemId, quantidade: 0, valor: 0 };
    g.quantidade += q;
    g.valor += v;
    mapa.set(k, g);
  };
  for (const mv of movs) {
    if (mv.cancelado || mv.data < periodo.inicio || mv.data > periodo.fim) continue;
    const v = posicao.custos[mv.id]?.valor ?? 0;
    if (mv.tipo === 'saida') somar(mv.localId, mv.itemId, mv.quantidade, v);
    else if (mv.tipo === 'devolucao') somar(mv.localId, mv.itemId, -mv.quantidade, -v);
    else if (mv.tipo === 'transferencia') {
      somar(mv.localId, mv.itemId, -mv.quantidade, -v);
      somar(mv.localDestinoId, mv.itemId, mv.quantidade, v);
    }
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, valor: Math.round(g.valor * 100) / 100 }))
    .sort((a, b) => a.localId.localeCompare(b.localId) || a.itemId.localeCompare(b.itemId));
}
