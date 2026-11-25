import { ehAdminFinanceiro, podeConferir, type Aprovador, type EventoPedido, type Pedido, type StatusPedido, type Usuario } from './tipos';
export type { Aprovador } from './tipos';

/** Acima disto, todo pedido (menos reembolso) precisa de aprovação de administrador. */
export const LIMITE_APROVACAO = 300;
/** Reembolso até este valor o pagador aprova; acima, só administrador. */
export const LIMITE_REEMBOLSO_PAGADOR = 150;

/** Quem pode aprovar: depende do valor, do tipo e de quem abriu o pedido (pedido do pagador sempre vai a um administrador). */
export function aprovadorExigido(p: Pick<Pedido, 'tipo' | 'valor'>, abriuPagador: boolean): Aprovador {
  if (abriuPagador) return 'admin';
  if (p.tipo === 'reembolso') return p.valor > LIMITE_REEMBOLSO_PAGADOR ? 'admin' : 'pagador';
  return p.valor > LIMITE_APROVACAO ? 'admin' : 'nenhum';
}

/** Confere, vê todos os pedidos, devolve e fecha faturas (pagador e administrador). Pagar exige `podePagar`. */
export const podeConferirOuPagar = podeConferir;

/** O papel de quem abriu o pedido não fica no pedido: vem do usuário que o criou. */
export interface QuemAbriu { id: string; pagador: boolean }

export function podeAprovar(u: Usuario, exigido: Aprovador): boolean {
  if (exigido === 'nenhum') return podeConferirOuPagar(u);
  if (exigido === 'admin') return ehAdminFinanceiro(u);
  return podeConferirOuPagar(u);
}

export const ABERTOS: StatusPedido[] = ['enviado', 'aprovacao', 'pronto', 'devolvido'];
export const ehAberto = (p: Pick<Pedido, 'status'>) => ABERTOS.includes(p.status);

/** Quem pode mexer no pedido do solicitante (editar, reenviar): só ele, enquanto não foi conferido. */
export const podeEditar = (u: Usuario, p: Pedido) => (p.status === 'enviado' || p.status === 'devolvido') && p.criado.id === u.id;

/** Posição na fila de pagamento: urgentes primeiro, depois por vencimento (sem data por último). */
export function ordemDePagamento(a: Pedido, b: Pedido): number {
  if (!!a.urgente !== !!b.urgente) return a.urgente ? -1 : 1;
  const va = a.vencimento ?? '9999-12-31'; const vb = b.vencimento ?? '9999-12-31';
  return va === vb ? a.criado.em.localeCompare(b.criado.em) : va.localeCompare(vb);
}

export type Prazo = 'vencido' | 'hoje' | 'amanha' | 'semana' | 'depois' | 'sem';
export function prazoDoPedido(p: Pick<Pedido, 'vencimento'>, hoje: string): Prazo {
  if (!p.vencimento) return 'sem';
  if (p.vencimento < hoje) return 'vencido';
  if (p.vencimento === hoje) return 'hoje';
  const dias = (Date.parse(p.vencimento) - Date.parse(hoje)) / 86_400_000;
  return dias === 1 ? 'amanha' : dias <= 7 ? 'semana' : 'depois';
}

/** Pedidos que parecem o mesmo pagamento: mesma chave da NF-e, mesmo boleto, ou mesmo favorecido com valor e vencimento iguais. */
export function possiveisDuplicados(novo: Pick<Pedido, 'id' | 'valor' | 'vencimento' | 'chavePix' | 'fornecedorId' | 'favorecido' | 'boleto' | 'nota'>, outros: Pedido[]) {
  const mesmaPessoa = (o: Pedido) => (novo.fornecedorId && o.fornecedorId === novo.fornecedorId)
    || (novo.chavePix && o.chavePix === novo.chavePix)
    || (!!novo.favorecido && o.favorecido?.toLowerCase() === novo.favorecido.toLowerCase());
  const vivos = outros.filter((o) => o.id !== novo.id && o.status !== 'cancelado' && o.status !== 'rejeitado');
  const exatos = vivos.filter((o) => (novo.boleto && o.boleto === novo.boleto) || (novo.nota?.chave && o.nota?.chave === novo.nota.chave && o.valor === novo.valor));
  const parecidos = vivos.filter((o) => !exatos.includes(o) && mesmaPessoa(o) && o.valor === novo.valor && (o.vencimento ?? '') === (novo.vencimento ?? ''));
  return { exatos, parecidos };
}

export const ultimoEvento = (p: Pedido): EventoPedido | undefined => p.historico[p.historico.length - 1];
