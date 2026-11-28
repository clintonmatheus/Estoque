import { documentoValido, idSeguro } from './validar';

const criado = { id: 'u1', nome: 'Ana', em: '2026-11-28T10:00:00Z' };

describe('documentoValido', () => {
  it('aceita documentos no formato do app', () => {
    expect(documentoValido('itens', { id: 'mf1-ab12', nome: 'Tinta', criado })).toBe(true);
    expect(documentoValido('pedidos', { id: 'p1', status: 'enviado', historico: [], criado })).toBe(true);
    expect(documentoValido('funcionarios', { id: 'f1', nome: 'João' })).toBe(true);
  });
  it('recusa o que quebraria as listas de outros usuários', () => {
    expect(documentoValido('pedidos', { id: 'p1', status: 'enviado', historico: [], criado: { id: 'u1' } })).toBe(false);
    expect(documentoValido('pedidos', { id: 'p1', historico: [], criado })).toBe(false);
    expect(documentoValido('movimentos', { id: 'm1', itemId: 'i', criado })).toBe(false);
    expect(documentoValido('compras', { id: 'c1', data: 5, criado })).toBe(false);
    expect(documentoValido('itens', { id: 'i1', criado })).toBe(false);
    expect(documentoValido('itens', null)).toBe(false);
  });
  it('só aceita id que pode virar nome de arquivo', () => {
    expect(idSeguro('lx2k9-ab12cd34')).toBe(true);
    expect(idSeguro('../x')).toBe(false);
    expect(idSeguro('a/b')).toBe(false);
    expect(idSeguro('')).toBe(false);
  });
});
