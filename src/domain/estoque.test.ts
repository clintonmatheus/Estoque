import { calcularPosicao, gastosPorLocal, novosProblemas } from './estoque';
import type { Movimento, TipoMovimento } from './tipos';

let seq = 0;
const quem = { id: 'u', nome: 'Marilia', em: '2026-11-11T12:00:00.000Z' };
function m(tipo: TipoMovimento, data: string, quantidade: number, extra: Partial<Movimento> = {}): Movimento {
  seq += 1;
  return { id: `m${seq}`, grupo: `g${seq}`, tipo, data, itemId: 'tinta', quantidade, criado: { ...quem, em: `2026-11-11T12:00:${String(seq % 60).padStart(2, '0')}.000Z` }, ...extra };
}

describe('calcularPosicao — PEPS', () => {
  it('sai primeiro o que entrou primeiro (exemplo: 20 a R$ 50 e 10 a R$ 52)', () => {
    const e1 = m('entrada', '2026-11-01', 20, { custoUnitario: 50 });
    const e2 = m('entrada', '2026-11-02', 10, { custoUnitario: 52 });
    const s1 = m('saida', '2026-11-03', 15, { localId: 'riachuelo' });
    const s2 = m('saida', '2026-11-04', 10, { localId: 'macaiba' });
    const p = calcularPosicao([s2, e2, s1, e1]);
    expect(p.custos[s1.id].valor).toBeCloseTo(750);
    expect(p.custos[s2.id].valor).toBeCloseTo(5 * 50 + 5 * 52);
    expect(p.itens.tinta.quantidade).toBe(5);
    expect(p.itens.tinta.valor).toBeCloseTo(5 * 52);
    expect(p.locais.riachuelo.tinta).toEqual({ quantidade: 15, valor: 750 });
    expect(p.problemas).toEqual([]);
    expect(p.saldoApos[s1.id]).toBe(15);
  });

  it('ordena por data e, no mesmo dia, pela hora do lançamento', () => {
    const s = m('saida', '2026-11-01', 5, { localId: 'a' });
    const e = m('entrada', '2026-11-01', 5, { custoUnitario: 10, criado: { ...quem, em: '2026-11-01T08:00:00.000Z' } });
    expect(calcularPosicao([s, e]).problemas).toEqual([]);
  });

  it('ignora lançamentos cancelados', () => {
    const e = m('entrada', '2026-11-01', 5, { custoUnitario: 10, cancelado: { ...quem, motivo: 'duplicado' } });
    expect(calcularPosicao([e]).itens.tinta?.quantidade ?? 0).toBe(0);
  });

  it('aponta saída maior que o saldo', () => {
    const e = m('entrada', '2026-11-01', 3, { custoUnitario: 10 });
    const s = m('saida', '2026-11-02', 5, { localId: 'a' });
    const p = calcularPosicao([e, s]);
    expect(p.problemas).toEqual([{ movimentoId: s.id, itemId: 'tinta', disponivel: 3 }]);
  });

  it('devolução volta ao galpão pelo custo médio do que estava na frente e abate o valor da frente', () => {
    const e1 = m('entrada', '2026-11-01', 10, { custoUnitario: 50 });
    const e2 = m('entrada', '2026-11-01', 10, { custoUnitario: 60 });
    const s = m('saida', '2026-11-02', 15, { localId: 'a' }); // 10x50 + 5x60 = 800 → média 53,33
    const d = m('devolucao', '2026-11-03', 3, { localId: 'a' });
    const p = calcularPosicao([e1, e2, s, d]);
    expect(p.custos[d.id].valor).toBeCloseTo(160);
    expect(p.locais.a.tinta.quantidade).toBe(12);
    expect(p.locais.a.tinta.valor).toBeCloseTo(640);
    expect(p.itens.tinta.quantidade).toBe(8);
    expect(p.itens.tinta.valor).toBeCloseTo(5 * 60 + 160);
  });

  it('não devolve mais do que a frente recebeu', () => {
    const e = m('entrada', '2026-11-01', 10, { custoUnitario: 50 });
    const s = m('saida', '2026-11-02', 2, { localId: 'a' });
    const d = m('devolucao', '2026-11-03', 3, { localId: 'a' });
    expect(calcularPosicao([e, s, d]).problemas).toEqual([{ movimentoId: d.id, itemId: 'tinta', localId: 'a', disponivel: 2 }]);
  });

  it('transferência leva quantidade e valor de uma frente para outra sem mexer no galpão', () => {
    const e = m('entrada', '2026-11-01', 10, { custoUnitario: 50 });
    const s = m('saida', '2026-11-02', 4, { localId: 'a' });
    const t = m('transferencia', '2026-11-03', 1, { localId: 'a', localDestinoId: 'b' });
    const p = calcularPosicao([e, s, t]);
    expect(p.locais.a.tinta).toEqual({ quantidade: 3, valor: 150 });
    expect(p.locais.b.tinta).toEqual({ quantidade: 1, valor: 50 });
    expect(p.itens.tinta.quantidade).toBe(6);
  });

  it('ajuste negativo baixa pelo PEPS; positivo entra pelo custo informado ou pelo último custo', () => {
    const e = m('entrada', '2026-11-01', 10, { custoUnitario: 50 });
    const a1 = m('ajuste', '2026-11-02', -2);
    const a2 = m('ajuste', '2026-11-03', 1);
    const a3 = m('ajuste', '2026-11-03', 1, { custoUnitario: 70 });
    const p = calcularPosicao([e, a1, a2, a3]);
    expect(p.custos[a1.id].valor).toBeCloseTo(100);
    expect(p.custos[a2.id].valor).toBeCloseTo(50);
    expect(p.itens.tinta.quantidade).toBe(10);
    expect(p.itens.tinta.valor).toBeCloseTo(8 * 50 + 50 + 70);
  });

  it('ajuste positivo sem histórico usa o custo de referência do item', () => {
    const a = m('ajuste', '2026-11-01', 4);
    const p = calcularPosicao([a], { tinta: 12.5 });
    expect(p.itens.tinta.valor).toBeCloseTo(50);
  });
});

describe('novosProblemas', () => {
  it('detecta só os problemas causados pela alteração', () => {
    const e = m('entrada', '2026-11-01', 5, { custoUnitario: 10 });
    const s = m('saida', '2026-11-02', 5, { localId: 'a' });
    expect(novosProblemas([e], [e, s])).toEqual([]);
    // cancelar a entrada deixaria a saída sem saldo
    const cancelada = { ...e, cancelado: { ...quem, motivo: 'x' } };
    expect(novosProblemas([e, s], [cancelada, s]).map((p) => p.movimentoId)).toEqual([s.id]);
  });
});

describe('gastosPorLocal', () => {
  it('soma saídas, desconta devoluções e considera transferências no período', () => {
    const e = m('entrada', '2026-10-01', 20, { custoUnitario: 10 });
    const s0 = m('saida', '2026-10-15', 2, { localId: 'a' });
    const s1 = m('saida', '2026-11-02', 5, { localId: 'a' });
    const d = m('devolucao', '2026-11-03', 1, { localId: 'a' });
    const t = m('transferencia', '2026-11-04', 2, { localId: 'a', localDestinoId: 'b' });
    const todos = [e, s0, s1, d, t];
    const g = gastosPorLocal(todos, calcularPosicao(todos), { inicio: '2026-11-01', fim: '2026-11-30' });
    expect(g).toEqual([
      { localId: 'a', itemId: 'tinta', quantidade: 2, valor: 20 },
      { localId: 'b', itemId: 'tinta', quantidade: 2, valor: 20 },
    ]);
  });
});
