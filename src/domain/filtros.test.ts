import { aplicarFiltro, opcoesDeFiltro, type LinhaSaldo } from './filtros';

const l = (nome: string, saldo: number, extra: Partial<LinhaSaldo> = {}): LinhaSaldo =>
  ({ itemId: nome, nome, unidade: 'un', estoqueMinimo: 0, saldo, categoria: 'Pintura', ...extra });

const linhas = [
  l('A', 0), l('B', 3, { estoqueMinimo: 5 }), l('C', 10, { ultimaSaida: '2026-11-20' }),
  l('D', 4, { ultimaSaida: '2026-08-01', categoria: 'Elétrica' }), l('E', 2, { categoria: 'Elétrica', ultimaSaida: '2026-09-24' }),
];
const ids = (x: LinhaSaldo[]) => x.map((i) => i.itemId);

describe('filtros do estoque', () => {
  it('zerados, com saldo, abaixo do mínimo e por categoria', () => {
    expect(ids(aplicarFiltro(linhas, 'zerados', '2026-11-23'))).toEqual(['A']);
    expect(ids(aplicarFiltro(linhas, 'com-saldo', '2026-11-23'))).toEqual(['B', 'C', 'D', 'E']);
    expect(ids(aplicarFiltro(linhas, 'minimo', '2026-11-23'))).toEqual(['B']);
    expect(ids(aplicarFiltro(linhas, 'cat:Elétrica', '2026-11-23'))).toEqual(['D', 'E']);
  });
  it('parados: com saldo e sem saída há 60 dias (ou nunca)', () => {
    expect(ids(aplicarFiltro(linhas, 'parados', '2026-11-23'))).toEqual(['B', 'D', 'E']);
  });
  it('opções com contagem; sem categorias vazias; parados só para quem lança', () => {
    const o = opcoesDeFiltro(linhas, '2026-11-23', false);
    expect(o.map((x) => `${x.titulo} ${x.quantidade}`)).toEqual([
      'Todos 5', 'Com saldo 4', 'Zerados 1', 'Abaixo do mínimo 1', 'Pintura 3', 'Elétrica 2',
    ]);
    expect(opcoesDeFiltro(linhas, '2026-11-23', true).some((x) => x.id === 'parados')).toBe(true);
  });
});
