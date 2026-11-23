import { categoriaDoItem, inferirCategoria } from './categorias';
import { ITENS_INICIAIS } from './itensIniciais';

describe('categorias', () => {
  it('classifica a lista do galpão', () => {
    const por = (nome: string) => inferirCategoria(nome);
    expect(por('CABO PRA ROLO DE 23CM')).toBe('Pintura');
    expect(por('DELANIL ARARA AZUL IQUINE 18L')).toBe('Pintura');
    expect(por('MASSA CORRIDA FAMA')).toBe('Pintura');
    expect(por('ESPATULA')).toBe('Pintura');
    expect(por('LAMPADA 9W')).toBe('Elétrica');
    expect(por('REFLETOR DE 200W')).toBe('Elétrica');
    expect(por('TORNEIRA DE INOX')).toBe('Hidráulica e louças');
    expect(por('VASO SANITARIO COM CAIXA ACOPLADA')).toBe('Hidráulica e louças');
    expect(por('FECHADURA EXTERNA')).toBe('Ferragens');
    expect(por('PREGO 2/10')).toBe('Ferragens');
    expect(por('REVESTIMENTO CERAMICO CERBRAS 46x46')).toBe('Revestimentos e acabamento');
    expect(por('REJUNTE CINZA')).toBe('Revestimentos e acabamento');
    expect(por('PLACA ENRUGADA 40/90CM')).toBe('Revestimentos e acabamento');
    expect(ITENS_INICIAIS.filter((i) => por(i.nome) === 'Outros').map((i) => i.nome)).toEqual([]);
  });
  it('a categoria do cadastro prevalece', () => {
    expect(categoriaDoItem({ nome: 'LAMPADA 9W', categoria: 'Outros' })).toBe('Outros');
    expect(categoriaDoItem({ nome: 'LAMPADA 9W' })).toBe('Elétrica');
  });
});
