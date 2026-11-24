import { readFileSync } from 'fs';
import { join } from 'path';
import { TIPOS_DESPESA_INICIAIS } from '../domain/nomes';
import { CLINTON_FIN, estoqueComCadastros, financeiroDeTeste } from '../testes/fabricas';
import { planilha } from '../testes/planilha';
import { ABAS_FIN, importarCadastrosFinanceiro, lerCadastrosFinanceiro, simularCadastrosFinanceiro } from './cadastrosFinanceiro';
import { lerXlsx, type Celula } from './lerXlsx';

const MODELO = join(__dirname, '../../modelos/Cadastros_Financeiro.xlsx');
const cab = (k: keyof typeof ABAS_FIN) => [...ABAS_FIN[k].colunas] as Celula[];

describe('planilha de cadastros do financeiro', () => {
  it('o modelo tem as abas e cabeçalhos que o app espera, e os tipos iguais aos do app', async () => {
    const abas = await lerXlsx(new Uint8Array(readFileSync(MODELO)));
    for (const k of Object.keys(ABAS_FIN) as (keyof typeof ABAS_FIN)[]) expect(abas[ABAS_FIN[k].nome][0]).toEqual(ABAS_FIN[k].colunas);
    const cad = lerCadastrosFinanceiro(abas);
    expect(cad.erros).toEqual([]);
    expect(cad.tipos.map((t) => [t.nome, t.apelidos])).toEqual(TIPOS_DESPESA_INICIAIS.map((t) => [t.nome, t.apelidos]));
    expect(cad.frentes).toHaveLength(21);
    expect(cad.centros.find((c) => c.nome === 'CODERN')).toMatchObject({ ativo: false, apelidos: ['CODERN 2026'] });
    expect(cad.centros.filter((c) => c.especial).map((c) => c.nome)).toEqual(['Administração', 'Estoque/Galpão']);
  });

  it('modelo: importa tudo, liga as frentes do estoque (mesmo nome ou contrato conhecido) e não duplica numa segunda vez', async () => {
    const abas = await lerXlsx(new Uint8Array(readFileSync(MODELO)));
    // estoqueComCadastros tem Riachuelo e Macaíba no contrato "Escritórios da RMG" (outro nome de ESC RMG)
    const e = await estoqueComCadastros(CLINTON_FIN);
    await e.estoque.salvarLocal({ nome: 'SMS', centroCusto: 'Saúde', ativo: true });
    const { financeiro } = financeiroDeTeste(CLINTON_FIN, e.armazenamento);
    const cad = lerCadastrosFinanceiro(abas);
    expect(cad.erros).toEqual([]);

    const sim = await simularCadastrosFinanceiro(financeiro, cad);
    expect(sim.erros).toEqual([]);
    expect(await financeiro.empresas()).toEqual([]); // simulação não grava
    const r = await importarCadastrosFinanceiro(financeiro, cad);
    expect(r).toEqual({ empresas: 2, contas: 6, centros: 13, frentes: 20, frentesLigadas: 3, fornecedores: 1, tipos: 19, existentes: 0 });
    expect(sim.resumo).toEqual(r);

    const sms = (await financeiro.frentes()).filter((f) => f.nome === 'SMS');
    expect(sms).toHaveLength(1);
    expect(sms[0].centroCusto).toBe('SMS');
    const rmg = (await financeiro.centros()).find((c) => c.nome === 'RMG ÁGUA')!;
    expect(rmg.apelidos).toEqual(['CAIXA RMG']);
    const esc = (await financeiro.centros()).find((c) => c.nome === 'ESC RMG')!;
    expect((await e.estoque.locais()).filter((l) => l.centroId === esc.id).map((l) => l.nome).sort()).toEqual(
      ['CAERN SEDE', 'ESC LAGOA DE VELHOS', 'ESC PEDRA GRANDE', 'ESC RIACHUELO', 'ESC SÃO BENTO DO NORTE', 'Macaíba', 'Riachuelo']);
    expect((await financeiro.centros(true)).find((c) => c.nome === 'CODERN')?.ativo).toBe(false);
    expect(await financeiro.frentesSemCentro()).toEqual([]);
    expect((await financeiro.fornecedores())[0]).toMatchObject({ nome: 'Aço Potiguar', documento: '05948553000275', chavePix: '05948553000275', forma: 'pix' });

    const de_novo = await importarCadastrosFinanceiro(financeiro, cad);
    expect(de_novo).toEqual({ empresas: 0, contas: 0, centros: 0, frentes: 0, frentesLigadas: 0, fornecedores: 0, tipos: 0, existentes: 2 + 6 + 13 + 21 + 1 + 19 });
  });

  it('erros vêm com aba e linha; CNPJ digitado como número recupera o zero da frente', async () => {
    const bytes = await planilha({
      Empresas: [cab('empresas'), ['ALN', 'ALN Ltda', 5948553000275], ['Passos', 'Construtora Passos', '11.111.111/1111-11']],
      'Contas bancárias': [cab('contas'), ['XYZ', 'Inter']],
      'Centros de custo': [cab('centros'), ['SMS', 'Obra', 'Ativo', 'ALN'], ['Galpão', 'Depósito']],
      'Frentes de serviço': [cab('frentes'), ['UBS', 'Saúde']],
      Fornecedores: [cab('fornecedores'), ['Loja', undefined, undefined, 'Cheque'], ['Casa do Construtor', undefined, undefined, 'Fatura semanal', 'sexta-feira'], ['Sem pix', undefined, undefined, 'Pix']],
    });
    const cad = lerCadastrosFinanceiro(await lerXlsx(bytes));
    expect(cad.empresas[0].cnpj).toBe('05948553000275');
    expect(cad.fornecedores.find((f) => f.nome === 'Casa do Construtor')?.diaFechamento).toBe('sexta');
    const { financeiro } = financeiroDeTeste();
    const { erros } = await simularCadastrosFinanceiro(financeiro, cad);
    expect(erros.map((x) => `${x.aba} ${x.linha}: ${x.mensagem}`)).toEqual([
      'Centros de custo 3: Tipo inválido: "Depósito" (use Obra, Administração ou Estoque/Galpão)',
      'Fornecedores 2: Forma de pagamento inválido: "Cheque" (use Pix, Boleto ou Fatura semanal)',
      'Empresas 3: CPF/CNPJ inválido: 11.111.111/1111-11',
      'Contas bancárias 2: Empresa "XYZ" não encontrada (cadastre na aba Empresas ou no app)',
      'Frentes de serviço 2: Centro de custo "Saúde" não encontrado',
      'Fornecedores 4: Informe a chave Pix (forma de pagamento Pix)',
    ]);
  });
});
