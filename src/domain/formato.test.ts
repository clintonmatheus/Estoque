import { formatarMoeda, formatarQuantidade, lerNumero, paraUnidadeBase } from './formato';
import type { Item } from './tipos';

const quem = { id: 'u', nome: 'X', em: '2026-11-11T12:00:00.000Z' };
const piso: Item = { id: 'p', nome: 'Revestimento', unidade: 'pç', embalagem: { nome: 'cx', fator: 11 }, estoqueMinimo: 0, ativo: true, criado: quem };
const tinta: Item = { id: 't', nome: 'Tinta', unidade: 'lata', estoqueMinimo: 0, ativo: true, criado: quem };

describe('formato', () => {
  it('converte caixas em peças', () => {
    expect(paraUnidadeBase(piso, 2, true)).toBe(22);
    expect(paraUnidadeBase(piso, 3, false)).toBe(3);
    expect(paraUnidadeBase(tinta, 2, true)).toBe(2);
  });
  it('mostra quantidade com a embalagem quando houver', () => {
    expect(formatarQuantidade(piso, 25)).toBe('25 pç (2 cx + 3 pç)');
    expect(formatarQuantidade(piso, 22)).toBe('22 pç (2 cx)');
    expect(formatarQuantidade(piso, 5)).toBe('5 pç');
    expect(formatarQuantidade(tinta, 2.5)).toBe('2,5 lata');
    expect(formatarQuantidade(tinta, -1)).toBe('-1 lata');
  });
  it('formata moeda em reais', () => {
    expect(formatarMoeda(1234.5)).toBe('R$ 1.234,50');
    expect(formatarMoeda(-3)).toBe('-R$ 3,00');
  });
  it('lê números digitados com vírgula ou ponto', () => {
    expect(lerNumero('1,5')).toBe(1.5);
    expect(lerNumero('1.234,56')).toBe(1234.56);
    expect(lerNumero('52.00')).toBe(52);
    expect(lerNumero(' 7 ')).toBe(7);
    expect(lerNumero('')).toBeUndefined();
    expect(lerNumero('abc')).toBeUndefined();
  });
});
