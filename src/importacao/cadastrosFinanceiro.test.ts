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
    expect(cad.erros.map((e) => `${e.aba} ${e.linha}: ${e.mensagem}`)).toEqual([
      // obrigatório escolher a empresa dos 8 centros de obra
      ...[2, 3, 4, 5, 6, 7, 8, 9].map((l) => `Centros de custo ${l}: Informe a empresa (cada centro de custo pertence a uma só)`),
    ]);
    expect(cad.tipos.map((t) => [t.nome, t.apelidos])).toEqual(TIPOS_DESPESA_INICIAIS.map((t) => [t.nome, t.apelidos]));
    expect(cad.frentes).toHaveLength(17);
  });

  it('modelo preenchido: importa tudo, liga a frente do estoque com o mesmo nome e não duplica numa segunda vez', async () => {
    const abas = await lerXlsx(new Uint8Array(readFileSync(MODELO)));
    const centros = abas['Centros de custo'];
    for (let i = 1; i <= 8; i++) centros[i][1] = i <= 4 ? 'ALN' : 'Passos';
    const e = await estoqueComCadastros(CLINTON_FIN);
    await e.estoque.salvarLocal({ nome: 'SMS', centroCusto: 'Saúde', ativo: true });
    const { financeiro } = financeiroDeTeste(CLINTON_FIN, e.armazenamento);
    const cad = lerCadastrosFinanceiro(abas);
    expect(cad.erros).toEqual([]);

    const sim = await simularCadastrosFinanceiro(financeiro, cad);
    expect(sim.erros).toEqual([]);
    expect(await financeiro.empresas()).toEqual([]); // simulação não grava
    const r = await importarCadastrosFinanceiro(financeiro, cad);
    expect(r).toEqual({ empresas: 2, contas: 6, centros: 12, frentes: 16, frentesLigadas: 1, fornecedores: 1, tipos: 19, existentes: 0 });
    expect(sim.resumo).toEqual(r);

    const sms = (await financeiro.frentes()).filter((f) => f.nome === 'SMS');
    expect(sms).toHaveLength(1);
    expect(sms[0].centroCusto).toBe('SMS');
    const rmg = (await financeiro.centros()).find((c) => c.nome === 'RMG ÁGUA')!;
    expect(rmg.apelidos).toEqual(['CAIXA RMG']);
    expect((await financeiro.fornecedores())[0]).toMatchObject({ nome: 'Aço Potiguar', documento: '05948553000275', chavePix: '05948553000275', forma: 'pix' });

    const de_novo = await importarCadastrosFinanceiro(financeiro, cad);
    expect(de_novo).toEqual({ empresas: 0, contas: 0, centros: 0, frentes: 0, frentesLigadas: 0, fornecedores: 0, tipos: 0, existentes: 2 + 6 + 12 + 17 + 1 + 19 });
  });

  it('erros vêm com aba e linha; CNPJ digitado como número recupera o zero da frente', async () => {
    const bytes = await planilha({
      Empresas: [cab('empresas'), ['ALN', 'ALN Ltda', 5948553000275], ['Passos', 'Construtora Passos', '11.111.111/1111-11']],
      'Contas bancárias': [cab('contas'), ['XYZ', 'Inter']],
      'Centros de custo': [cab('centros'), ['SMS', 'ALN', 'Obra'], ['Galpão', 'ALN', 'Depósito']],
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
