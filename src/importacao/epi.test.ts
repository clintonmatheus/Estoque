import { readFileSync } from 'fs';
import { join } from 'path';
import { estoqueComCadastros } from '../testes/fabricas';
import { planilha } from '../testes/planilha';
import { ABAS_EPI, importarEpi, lerEpi, simularEpi } from './epi';
import { lerXlsx } from './lerXlsx';

const cab = (k: keyof typeof ABAS_EPI) => [...ABAS_EPI[k].colunas];
const MODELOS = join(__dirname, '../../modelos');

describe('planilhas de EPI', () => {
  it('os dois modelos têm as abas e cabeçalhos que o app espera', async () => {
    const f = await lerXlsx(new Uint8Array(readFileSync(join(MODELOS, 'Funcionarios_EPI.xlsx'))));
    expect(f[ABAS_EPI.funcionarios.nome][0]).toEqual(cab('funcionarios'));
    const i = await lerXlsx(new Uint8Array(readFileSync(join(MODELOS, 'Itens_EPI.xlsx'))));
    expect(i[ABAS_EPI.itens.nome][0]).toEqual(cab('itens'));
    const d = lerEpi(i);
    expect(d.erros).toEqual([]);
    expect(d.itens.length).toBeGreaterThanOrEqual(8);
    expect(d.itens.find((x) => x.nome === 'Bota de segurança')?.tipoTamanho).toBe('calcado');
  });

  it('importa funcionários e itens como EPI, sem misturar com o galpão, e não duplica na segunda vez', async () => {
    const { estoque } = await estoqueComCadastros();
    const galpao = await estoque.salvarFuncionario({ nome: 'José Almeida', ativo: true }); // mesmo nome, outro grupo
    const bytes = await planilha({
      'Funcionários EPI': [cab('funcionarios'), ['José Almeida', '123.456.789-09', 'Servente', 41, 'G', 'G'], ['Ana', 12345678909 + 1, undefined, undefined, undefined, undefined, 'Inativo']],
      'Itens EPI': [cab('itens'), ['Bota de segurança', 'par', '42291', 180, '38; 39; 40; 41', 'Calçado', 4, 10, 89.9], ['Capacete', 'un']],
    });
    const d = lerEpi(await lerXlsx(bytes));
    expect(d.erros).toEqual([]);
    expect(d.funcionarios[0]).toMatchObject({ cpf: '12345678909', tamanhos: { calcado: '41', camisa: 'G', luva: 'G' }, ativo: true });
    expect(d.funcionarios[1]).toMatchObject({ cpf: '12345678910', ativo: false });

    const sim = await simularEpi(estoque, d, '2026-11-25');
    expect(sim.erros.map((e) => e.mensagem)).toEqual(['CPF inválido']); // CPF da Ana é inventado
    d.funcionarios[1].cpf = undefined;
    const ok = await simularEpi(estoque, d, '2026-11-25');
    expect(ok.erros).toEqual([]);
    expect(await estoque.funcionarios(true, 'epi')).toEqual([]); // simulação não grava

    const r = await importarEpi(estoque, d, '2026-11-25');
    expect(r).toEqual({ funcionarios: 2, funcionariosAtualizados: 0, itensNovos: 2, itensAtualizados: 0, itensComSaldo: 1 });
    expect((await estoque.funcionarios(true, 'epi')).map((f) => f.nome)).toEqual(['Ana', 'José Almeida']);
    expect((await estoque.funcionarios(true, 'galpao')).map((f) => f.id)).toContain(galpao.id);
    expect((await estoque.funcionarios(true, 'galpao')).find((f) => f.id === galpao.id)?.cpf).toBeUndefined();
    const bota = (await estoque.itens(true, 'epi')).find((i) => i.nome === 'BOTA DE SEGURANÇA')!;
    expect(bota).toMatchObject({ categoria: 'EPI', ca: '42291', vidaUtilDias: 180, tamanhos: ['38', '39', '40', '41'], tipoTamanho: 'calcado', estoqueMinimo: 4 });
    expect((await estoque.itens(true, 'material')).map((i) => i.nome)).not.toContain('BOTA DE SEGURANÇA');
    expect((await estoque.posicao()).itens[bota.id].quantidade).toBe(10);

    // segunda vez: nada novo; saldo que já existe é erro claro
    const de_novo = await simularEpi(estoque, d, '2026-11-25');
    expect(de_novo.erros.map((e) => `${e.aba} ${e.linha}: ${e.mensagem}`)).toEqual([
      'Itens EPI 2: BOTA DE SEGURANÇA já tem saldo no app (10 par); para corrigir use o Inventário de EPI',
    ]);
  });

  it('erros vêm com aba e linha', async () => {
    const { estoque } = await estoqueComCadastros();
    await estoque.salvarItem({ nome: 'Tinta', unidade: 'lata', estoqueMinimo: 0, ativo: true });
    const bytes = await planilha({
      'Funcionários EPI': [cab('funcionarios'), [undefined, '1'], ['Zé', undefined, undefined, undefined, undefined, undefined, 'Talvez']],
      'Itens EPI': [cab('itens'), ['Capacete'], ['Tinta', 'lata'], ['Luva', 'par', undefined, 0], ['Bota', 'par', undefined, undefined, undefined, 'Chapéu']],
    });
    const d = lerEpi(await lerXlsx(bytes));
    const { erros } = await simularEpi(estoque, d, '2026-11-25');
    expect(erros.map((e) => `${e.aba} ${e.linha}: ${e.mensagem}`)).toEqual([
      'Funcionários EPI 2: Informe o nome',
      expect.stringMatching(/^Funcionários EPI 3: Situação inválido: "Talvez"/),
      expect.stringMatching(/^Itens EPI 4: Vida útil/),
      expect.stringMatching(/^Itens EPI 5: Tamanho do funcionário inválido: "Chapéu"/),
      'Itens EPI 2: Item novo: informe a unidade',
      'Itens EPI 3: TINTA já está cadastrado como material do galpão',
    ]);
  });

  it('completa só o que a planilha traz e atualiza tamanhos de quem já existe', async () => {
    const { estoque } = await estoqueComCadastros();
    const f = await estoque.salvarFuncionario({ nome: 'Carlos', ativo: true, grupo: 'epi', tamanhos: { calcado: '40', camisa: 'M' } });
    const bytes = await planilha({ 'Funcionários EPI': [cab('funcionarios'), ['carlos', undefined, 'Pedreiro', 42]] });
    const r = await importarEpi(estoque, lerEpi(await lerXlsx(bytes)), '2026-11-25');
    expect(r).toMatchObject({ funcionarios: 0, funcionariosAtualizados: 1 });
    const c = (await estoque.funcionarios(true, 'epi')).find((x) => x.id === f.id)!;
    expect(c).toMatchObject({ funcao: 'Pedreiro', tamanhos: { calcado: '42', camisa: 'M' } });
  });
});
