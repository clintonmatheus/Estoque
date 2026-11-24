import { readFileSync } from 'fs';
import { join } from 'path';
import { posicoesDoBem } from '../domain/bens';
import { estoqueComCadastros } from '../testes/fabricas';
import { FORNECEDOR_LEVANTAMENTO, importarLevantamento, simularImportacao } from './aplicar';
import { planilha } from '../testes/planilha';
import { dataDaCelula, lerXlsx, type Celula } from './lerXlsx';
import { ABAS, lerLevantamento } from './levantamento';

const cab = (k: keyof typeof ABAS) => [...ABAS[k].colunas];
/** Linha da aba Equipamentos a partir dos campos que interessam. */
const eq = (o: Record<string, Celula>): Celula[] => ABAS.equipamentos.colunas.map((c) => o[c]);

describe('modelo da planilha', () => {
  it('o arquivo modelos/Levantamento_Estoque.xlsx tem as abas e cabeçalhos que o app espera', async () => {
    const abas = await lerXlsx(new Uint8Array(readFileSync(join(__dirname, '../../modelos/Levantamento_Estoque.xlsx'))));
    for (const k of ['frentes', 'funcionarios', 'materiais', 'equipamentos'] as const) {
      expect(abas[ABAS[k].nome][0]).toEqual(ABAS[k].colunas);
    }
    const lev = lerLevantamento(abas);
    expect(lev.erros).toEqual([]);
    expect(lev.materiais).toHaveLength(45); // itens do galpão já listados, sem quantidade
    expect(lev.materiais.every((m) => m.quantidade === undefined)).toBe(true);
    expect(lev.equipamentos).toEqual([]);
  });
});

describe('leitura de células', () => {
  it('datas do Excel (número de série) e texto dd/mm/aaaa', () => {
    expect(dataDaCelula(45658)).toBe('2025-01-01');
    expect(dataDaCelula('5/7/2026')).toBe('2026-07-05');
    expect(() => dataDaCelula('31/02/2026')).toThrow('Data inválida');
    expect(dataDaCelula(undefined)).toBeUndefined();
  });

  it('arquivo que não é planilha', async () => {
    await expect(lerXlsx(new Uint8Array([1, 2, 3]))).rejects.toThrow('Arquivo não é uma planilha .xlsx');
  });
});

describe('importação do levantamento', () => {
  async function exemplo() {
    const t = await estoqueComCadastros(); // já tem João, Riachuelo, TINTA e PISO
    const bytes = await planilha({
      'Frentes de serviço': [cab('frentes'), ['Pedra Grande', 'Escritórios da RMG'], ['riachuelo', 'Outro']],
      Funcionários: [cab('funcionarios'), ['Maria Souza'], ['JOÃO']],
      Materiais: [
        cab('materiais'),
        [t.tinta.nome, 'lata', undefined, 3, 12, 150],
        ['Fita crepe', 'rolo', 'Pintura', undefined, 20, '4,50'],
        ['Rolo de lã', 'un'], // só cadastra
      ],
      Equipamentos: [
        cab('equipamentos'),
        eq({ Nome: 'Furadeira', Código: '03', Tipo: 'Ferramenta', Controle: 'Individual', 'Onde está': 'Obra', 'Com quem': 'Maria Souza', 'Frente de serviço': 'Pedra Grande', 'Devolver até': '30/11/2026' }),
        eq({ Nome: 'Escora metálica', Tipo: 'Locado', Controle: 'Quantidade', Quantidade: 40, 'Onde está': 'Galpão', Locadora: 'Agaé', 'Nº do contrato': 1234,
          'Valor por peça (R$)': 2.5, Período: 'Mês', 'Início da locação': 46296, 'Fim previsto': '31/12/2026', 'Obra cobrada': 'Riachuelo' }),
        eq({ Nome: 'ESCORA METALICA', Tipo: 'Locado', Controle: 'Quantidade', Quantidade: 60, 'Onde está': 'Obra', 'Com quem': 'João', 'Frente de serviço': 'Riachuelo' }),
      ],
    });
    return { ...t, lev: lerLevantamento(await lerXlsx(bytes)) };
  }

  it('simula sem gravar e depois importa tudo', async () => {
    const { estoque, lev, tinta, joao, riachuelo } = await exemplo();
    expect(lev.erros).toEqual([]);
    const antes = (await estoque.movimentos()).length;
    const sim = await simularImportacao(estoque, lev, '2026-11-20');
    expect(sim.erros).toEqual([]);
    expect(sim.resumo).toEqual({ frentes: 1, funcionarios: 1, itensNovos: 2, itensAtualizados: 1, itensComSaldo: 2, equipamentos: 2, movimentacoes: 3 });
    expect((await estoque.movimentos()).length).toBe(antes); // nada gravado na simulação
    expect(await estoque.bens()).toEqual([]);

    const resumo = await importarLevantamento(estoque, lev, '2026-11-20');
    expect(resumo).toEqual(sim.resumo);
    // materiais: entrada única de saldo inicial com custo
    const p = await estoque.posicao();
    expect(p.itens[tinta.id].quantidade).toBe(12);
    expect(p.itens[tinta.id].valor).toBe(1800);
    const fita = (await estoque.itens()).find((i) => i.nome === 'FITA CREPE')!;
    expect(fita).toMatchObject({ unidade: 'rolo', categoria: 'Pintura', custoReferencia: 4.5 });
    expect(p.itens[fita.id].quantidade).toBe(20);
    expect((await estoque.itens()).find((i) => i.id === tinta.id)?.estoqueMinimo).toBe(3);
    const entrada = (await estoque.movimentos()).find((m) => m.fornecedor === FORNECEDOR_LEVANTAMENTO);
    expect(entrada?.data).toBe('2026-11-20');
    // frentes e funcionários: só os novos (Riachuelo e João já existiam)
    expect((await estoque.locais()).map((l) => l.nome).sort()).toEqual(['Macaíba', 'Pedra Grande', 'Riachuelo']);
    expect((await estoque.funcionarios()).map((f) => f.nome).sort()).toEqual(['João', 'Maria Souza']);
    // equipamentos
    const bens = await estoque.bens();
    const movs = await estoque.movimentosBens();
    const escora = bens.find((b) => b.nome === 'ESCORA METÁLICA')!;
    expect(escora.locacao).toEqual({ locadora: 'Agaé', contrato: '1234', valor: 2.5, periodo: 'mes', inicio: '2026-10-01', prevista: '2026-12-31', localCobrancaId: riachuelo.id });
    expect(posicoesDoBem(movs, escora.id).map((x) => x.quantidade)).toEqual([40, 60]);
    expect(posicoesDoBem(movs, escora.id)[1].posse).toEqual({ tipo: 'campo', funcionarioId: joao.id, localId: riachuelo.id });
    const furadeira = bens.find((b) => b.nome === 'FURADEIRA')!;
    expect(movs.find((m) => m.bemId === furadeira.id)?.prevista).toBe('2026-11-30');
  });

  it('erros de formato vêm com aba e linha', async () => {
    const bytes = await planilha({
      'Frentes de serviço': [cab('frentes'), ['Macaíba']],
      Materiais: [cab('materiais'), ['Cimento', 'saco', undefined, undefined, 10], ['Areia', 'm3', undefined, 'muito']],
      Equipamentos: [
        cab('equipamentos'),
        eq({ Nome: 'Serra', Tipo: 'Ferramenta', Controle: 'Individual', Quantidade: 2 }),
        eq({ Nome: 'Escada', Tipo: 'Própria', Controle: 'Individual' }),
        eq({ Nome: 'Andaime', Tipo: 'Locado', Controle: 'Quantidade', Quantidade: 10 }),
        eq({ Nome: 'Betoneira', Tipo: 'Ferramenta', Controle: 'Individual', 'Onde está': 'Obra' }),
        eq({ Nome: 'Martelete', Código: '1', Tipo: 'Ferramenta', Controle: 'Individual' }),
        eq({ Nome: 'martelete', Código: '1', Tipo: 'Ferramenta', Controle: 'Individual' }),
      ],
    });
    const { erros } = lerLevantamento(await lerXlsx(bytes));
    expect(erros.map((e) => `${e.aba} ${e.linha}: ${e.mensagem}`)).toEqual([
      'Frentes de serviço 2: Informe o centro de custo (contrato)',
      'Materiais 2: Informe o custo unitário (é usado no custo PEPS)',
      'Materiais 3: Número inválido: muito',
      'Equipamentos 2: Individual: uma linha por unidade (quantidade 1), com códigos diferentes',
      'Equipamentos 3: Tipo inválido: "Própria" (use ferramenta ou locado)',
      'Equipamentos 4: Locado: informe a locadora',
      'Equipamentos 5: Em obra: informe Com quem e a Frente de serviço',
      'Equipamentos 7: martelete 1 repetido: individuais precisam de códigos diferentes',
    ]);
  });

  it('a simulação aponta nomes não encontrados, item que já tem saldo e equipamento já cadastrado', async () => {
    const t = await estoqueComCadastros();
    await t.estoque.lancar({ tipo: 'entrada', data: '2026-11-01', linhas: [{ itemId: t.tinta.id, quantidade: 2, custoUnitario: 10 }] });
    await t.estoque.cadastrarBem({ nome: 'Serra', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: { tipo: 'galpao' }, quantidade: 1, data: '2026-11-01' });
    const bytes = await planilha({
      Materiais: [cab('materiais'), [t.tinta.nome, 'lata', undefined, undefined, 5, 10], ['Prego', undefined, undefined, undefined, 1, 1]],
      Equipamentos: [
        cab('equipamentos'),
        eq({ Nome: 'Serra', Tipo: 'Ferramenta', Controle: 'Individual' }),
        eq({ Nome: 'Escada', Tipo: 'Ferramenta', Controle: 'Individual', 'Onde está': 'Obra', 'Com quem': 'Fulano', 'Frente de serviço': 'Riachuelo' }),
        eq({ Nome: 'Escora', Tipo: 'Locado', Controle: 'Quantidade', Quantidade: 5, Locadora: 'X', 'Obra cobrada': 'Lugar nenhum' }),
      ],
    });
    const lev = lerLevantamento(await lerXlsx(bytes));
    const { erros } = await simularImportacao(t.estoque, lev, '2026-11-20');
    expect(erros.map((e) => `${e.aba} ${e.linha}: ${e.mensagem}`)).toEqual([
      `Materiais 2: ${t.tinta.nome} já tem saldo no app (2 lata); para corrigir use o Inventário`,
      'Materiais 3: Item novo: informe a unidade',
      'Equipamentos 2: Serra já está cadastrado no app',
      'Equipamentos 3: Funcionário "Fulano" não encontrado (cadastre na aba Funcionários)',
      'Equipamentos 4: Obra cobrada "Lugar nenhum" não encontrada (cadastre na aba Frentes de serviço)',
    ]);
    expect((await t.estoque.bens())).toHaveLength(1);
  });
});
