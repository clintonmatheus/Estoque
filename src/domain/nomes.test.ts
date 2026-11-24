import { acharPorNome, chaveNome, cnpjValido, cpfValido, documentoValido, formatarDocumento, juntarApelidos, lerChavePix, semelhanca, sugerirPorNome } from './nomes';

describe('nomes', () => {
  it('ignora acento, caixa, espaços e plural final', () => {
    expect(chaveNome(' RMG Água ')).toBe(chaveNome('rmg agua'));
    expect(chaveNome('SALARIO')).toBe(chaveNome('Salário'));
    expect(chaveNome('FERRAMENTAS')).toBe(chaveNome('Ferramenta'));
    expect(chaveNome('MANUTENÇÃO VEICULO')).toBe(chaveNome('Manutenção veículo'));
    expect(chaveNome('RMG MACAIBA ')).toBe(chaveNome('RMG MACAÍBA'));
  });

  it('acha pelo nome ou por outro nome e sugere o parecido', () => {
    const lista = [{ id: '1', nome: 'RMG São Pedro', apelidos: ['RMG SP do Potengi'] }, { id: '2', nome: 'RMG Lajes' }];
    expect(acharPorNome(lista, 'RMG SAO PEDRO')?.id).toBe('1');
    expect(acharPorNome(lista, 'rmg sp do potengi')?.id).toBe('1');
    expect(acharPorNome(lista, 'RMG SÃO PDERO')).toBeUndefined();
    expect(sugerirPorNome(lista, 'RMG SÃO PDERO')?.id).toBe('1');
    expect(sugerirPorNome(lista, 'RMG LAGES')?.id).toBe('2');
    expect(sugerirPorNome(lista, 'CBTU')).toBeUndefined();
    expect(semelhanca('abc', 'abc')).toBe(1);
  });

  it('junta outros nomes sem repetir', () => {
    expect(juntarApelidos('RMG Água', ['RMG AGUA', ' RMG Agua 2 ', 'rmg agua 2', ''])).toEqual(['RMG Agua 2']);
  });

  it('confere CPF e CNPJ pelos dígitos', () => {
    expect(cnpjValido('05.948.553/0002-75')).toBe(true); // chave do exemplo de pedido no WhatsApp
    expect(cnpjValido('05.948.553/0002-76')).toBe(false);
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(documentoValido('05948553000275')).toBe('05948553000275');
    expect(() => documentoValido('123')).toThrow('CPF/CNPJ inválido');
    expect(formatarDocumento('05948553000275')).toBe('05.948.553/0002-75');
  });

  it('identifica a chave Pix', () => {
    expect(lerChavePix('05948553000275')).toEqual({ chave: '05948553000275', tipo: 'cnpj' });
    expect(lerChavePix('529.982.247-25')).toEqual({ chave: '52998224725', tipo: 'cpf' });
    expect(lerChavePix('Financeiro@Loja.com.br')).toEqual({ chave: 'financeiro@loja.com.br', tipo: 'email' });
    expect(lerChavePix('(84) 99999-1234')).toEqual({ chave: '+5584999991234', tipo: 'telefone' });
    expect(lerChavePix('123e4567-e89b-12d3-a456-426614174000').tipo).toBe('aleatoria');
    expect(() => lerChavePix('abc')).toThrow('Chave Pix inválida');
  });
});
