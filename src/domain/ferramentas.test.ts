import { atrasado, diasDeAtraso, epiParaTrocar, emprestimoAberto, emprestimosAbertos, ultimaEntregaPorFuncionario } from './ferramentas';
import type { Autoria, Emprestimo, Movimento } from './tipos';

const por: Autoria = { id: 'u', nome: 'Marilia', em: '2026-11-10T12:00:00.000Z' };
const emp = (o: Partial<Emprestimo>): Emprestimo => ({
  id: 'e1', ferramentaId: 'f1', funcionarioId: 'j', saida: '2026-11-10', prevista: '2026-11-17', criado: por, ...o,
});

describe('empréstimos', () => {
  it('aberto só se não devolvido nem cancelado', () => {
    expect(emprestimoAberto(emp({}))).toBe(true);
    expect(emprestimoAberto(emp({ devolvidoEm: '2026-11-12' }))).toBe(false);
    expect(emprestimoAberto(emp({ cancelado: { ...por, motivo: 'erro' } }))).toBe(false);
    expect(emprestimosAbertos([emp({}), emp({ id: 'e2', devolvidoEm: '2026-11-12' })])).toHaveLength(1);
  });

  it('atrasado só depois da data prevista (no dia ainda não)', () => {
    expect(atrasado(emp({}), '2026-11-17')).toBe(false);
    expect(atrasado(emp({}), '2026-11-18')).toBe(true);
    expect(atrasado(emp({ devolvidoEm: '2026-11-20' }), '2026-11-25')).toBe(false);
    expect(diasDeAtraso(emp({}), '2026-11-20')).toBe(3);
    expect(diasDeAtraso(emp({}), '2026-11-16')).toBe(0);
  });
});

const epi = (o: Partial<Movimento>): Movimento => ({
  id: 'm', grupo: 'g', tipo: 'epi', data: '2026-01-10', itemId: 'bota', quantidade: 1, funcionarioId: 'j', criado: por, ...o,
});

describe('EPI a trocar', () => {
  it('lista vencidos e os que vencem nos próximos 30 dias, só a última entrega de cada item por funcionário', () => {
    const movs = [
      epi({ id: 'a', validade: '2026-06-01' }), // substituída pela entrega seguinte
      epi({ id: 'b', data: '2026-07-01', validade: '2026-11-20' }), // vence em 3 dias
      epi({ id: 'c', itemId: 'luva', validade: '2026-11-01' }), // vencida
      epi({ id: 'd', itemId: 'capacete', validade: '2027-05-01' }), // longe
      epi({ id: 'e', itemId: 'oculos' }), // sem validade
      epi({ id: 'f', itemId: 'luva', funcionarioId: 'k', validade: '2026-12-10', cancelado: { ...por, motivo: 'x' } }),
    ];
    const r = epiParaTrocar(movs, '2026-11-17', 30);
    expect(r.map((x) => [x.movimento.id, x.situacao])).toEqual([['c', 'vencido'], ['b', 'vence']]);
    expect(r[0].dias).toBe(-16);
    expect(r[1].dias).toBe(3);
  });

  it('última entrega por funcionário ignora cancelados', () => {
    const movs = [epi({ id: 'a' }), epi({ id: 'b', data: '2026-05-01' }), epi({ id: 'c', data: '2026-09-01', cancelado: { ...por, motivo: 'x' } })];
    expect(ultimaEntregaPorFuncionario(movs, 'j', 'bota')?.id).toBe('b');
    expect(ultimaEntregaPorFuncionario(movs, 'k', 'bota')).toBeUndefined();
  });
});
