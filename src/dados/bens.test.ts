import { posicoesDoBem, totalDoBem } from '../domain/bens';
import type { Posse } from '../domain/tipos';
import { ARTHUR, estoqueComCadastros, estoqueDeTeste } from '../testes/fabricas';

const galpao: Posse = { tipo: 'galpao' };
const externo: Posse = { tipo: 'externo' };

async function cenario() {
  const t = await estoqueComCadastros();
  const maria = await t.estoque.salvarFuncionario({ nome: 'Maria', ativo: true });
  const pedra = await t.estoque.salvarLocal({ nome: 'Pedra Grande', centroCusto: 'RMG', ativo: true });
  const campo = (funcionarioId: string, localId: string): Posse => ({ tipo: 'campo', funcionarioId, localId });
  return { ...t, maria, pedra, campo };
}

describe('Estoque — cadastro de bens', () => {
  it('cadastra ferramenta individual já com a posse inicial (levantamento)', async () => {
    const { estoque, joao, riachuelo, campo } = await cenario();
    const f = await estoque.cadastrarBem({ nome: ' Furadeira ', codigo: '03', tipo: 'ferramenta', controle: 'unidade', ativo: true },
      { posse: campo(joao.id, riachuelo.id), quantidade: 1, data: '2026-11-10' });
    expect(f).toMatchObject({ nome: 'FURADEIRA', codigo: '03', controle: 'unidade' });
    const movs = await estoque.movimentosBens();
    expect(movs).toHaveLength(1);
    expect(movs[0]).toMatchObject({ origem: externo, destino: campo(joao.id, riachuelo.id), quantidade: 1, observacao: 'Levantamento inicial' });
    expect(posicoesDoBem(movs, f.id)).toHaveLength(1);
    await expect(estoque.cadastrarBem({ nome: 'furadeira', codigo: '03', tipo: 'ferramenta', controle: 'unidade', ativo: true },
      { posse: galpao, quantidade: 1, data: '2026-11-10' })).rejects.toThrow('Já existe esse cadastro');
    expect(await estoque.bens()).toHaveLength(1);
  });

  it('equipamento locado exige locadora e valida valor e datas', async () => {
    const { estoque } = await cenario();
    const base = { nome: 'Escora', tipo: 'locado', controle: 'quantidade', ativo: true } as const;
    await expect(estoque.salvarBem(base)).rejects.toThrow('Informe a locadora');
    await expect(estoque.salvarBem({ ...base, locacao: { locadora: 'Agaé', valor: -1 } })).rejects.toThrow('Valor inválido');
    await expect(estoque.salvarBem({ ...base, locacao: { locadora: 'Agaé', inicio: '2026-11-10', prevista: '2026-11-01' } })).rejects.toThrow('O fim previsto não pode ser antes do início');
    await expect(estoque.salvarBem({ ...base, locacao: { locadora: 'Agaé', inicio: '10/11' } })).rejects.toThrow('Data inválida');
    const ok = await estoque.salvarBem({ ...base, locacao: { locadora: ' Agaé Locação ', contrato: ' 1234 ', valor: 2.5, periodo: 'mes', inicio: '2026-11-01', prevista: '2026-12-01' } });
    expect(ok.locacao).toEqual({ locadora: 'Agaé Locação', contrato: '1234', valor: 2.5, periodo: 'mes', inicio: '2026-11-01', prevista: '2026-12-01' });
  });

  it('locação aceita período diário, semanal, quinzenal e mensal', async () => {
    const { estoque } = await cenario();
    for (const periodo of ['dia', 'semana', 'quinzena', 'mes'] as const) {
      const b = await estoque.salvarBem({ nome: `Piso ${periodo}`, tipo: 'locado', controle: 'quantidade', ativo: true, locacao: { locadora: 'Agaé', valor: 1, periodo } });
      expect(b.locacao?.periodo).toBe(periodo);
    }
  });

  it('ferramenta própria não leva dados de locação; controle não muda depois de movimentar', async () => {
    const { estoque } = await cenario();
    const b = await estoque.cadastrarBem({ nome: 'Alicate', tipo: 'ferramenta', controle: 'quantidade', ativo: true, locacao: { locadora: 'X' } },
      { posse: galpao, quantidade: 6, data: '2026-11-10' });
    expect(b.locacao).toBeUndefined();
    await expect(estoque.salvarBem({ ...b, controle: 'unidade' })).rejects.toThrow('Não é possível mudar o controle depois de movimentar');
    expect((await estoque.salvarBem({ ...b, nome: 'Alicate universal' })).nome).toBe('ALICATE UNIVERSAL');
  });

  it('exige funcionário e frente existentes e ativos na posse em campo', async () => {
    const { estoque, joao } = await cenario();
    const novo = { nome: 'Serra', tipo: 'ferramenta', controle: 'unidade', ativo: true } as const;
    await expect(estoque.cadastrarBem(novo, { posse: { tipo: 'campo', funcionarioId: joao.id, localId: 'nao-existe' }, quantidade: 1, data: '2026-11-10' }))
      .rejects.toThrow('Frente de serviço não encontrada');
    await expect(estoque.cadastrarBem(novo, { posse: { tipo: 'campo', funcionarioId: 'fantasma', localId: 'x' }, quantidade: 1, data: '2026-11-10' }))
      .rejects.toThrow('Funcionário não encontrado');
    expect(await estoque.bens()).toHaveLength(0);
  });
});

describe('Estoque — movimentação de bens', () => {
  it('leva a ferramenta do galpão para a obra com prazo, e de uma obra para outra', async () => {
    const { estoque, joao, maria, riachuelo, pedra, campo } = await cenario();
    const f = await estoque.cadastrarBem({ nome: 'Furadeira', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: galpao, quantidade: 1, data: '2026-11-01' });
    const m1 = await estoque.movimentarBem({ bemId: f.id, data: '2026-11-02', quantidade: 1, origem: galpao, destino: campo(joao.id, riachuelo.id), prevista: '2026-11-09' });
    expect(m1.prevista).toBe('2026-11-09');
    await expect(estoque.movimentarBem({ bemId: f.id, data: '2026-11-03', quantidade: 1, origem: galpao, destino: campo(maria.id, pedra.id) })).rejects.toThrow('Saldo insuficiente');
    await estoque.movimentarBem({ bemId: f.id, data: '2026-11-04', quantidade: 1, origem: campo(joao.id, riachuelo.id), destino: campo(maria.id, pedra.id), observacao: ' emprestada ' });
    const movs = await estoque.movimentosBens();
    expect(movs.at(-1)?.observacao).toBe('emprestada');
    expect(posicoesDoBem(movs, f.id).map((p) => p.posse)).toEqual([campo(maria.id, pedra.id)]);
  });

  it('peças por quantidade: bloqueia saldo insuficiente e aceita devolução parcial à locadora', async () => {
    const { estoque, joao, riachuelo, campo } = await cenario();
    const e = await estoque.cadastrarBem({ nome: 'Escora', tipo: 'locado', controle: 'quantidade', ativo: true, locacao: { locadora: 'Agaé' } },
      { posse: galpao, quantidade: 100, data: '2026-11-01' });
    await estoque.movimentarBem({ bemId: e.id, data: '2026-11-02', quantidade: 60, origem: galpao, destino: campo(joao.id, riachuelo.id) });
    await expect(estoque.movimentarBem({ bemId: e.id, data: '2026-11-03', quantidade: 50, origem: galpao, destino: campo(joao.id, riachuelo.id) }))
      .rejects.toThrow('Saldo insuficiente: ESCORA — galpão tem 40');
    await estoque.movimentarBem({ bemId: e.id, data: '2026-11-04', quantidade: 40, origem: galpao, destino: externo, motivo: 'devolucao-locadora' });
    expect(totalDoBem(await estoque.movimentosBens(), e.id)).toBe(60);
  });

  it('chegada de mais peças (origem externa) só em bens por quantidade ou unidade ainda não cadastrada', async () => {
    const { estoque } = await cenario();
    const e = await estoque.cadastrarBem({ nome: 'Escora', tipo: 'locado', controle: 'quantidade', ativo: true, locacao: { locadora: 'Agaé' } }, { posse: galpao, quantidade: 10, data: '2026-11-01' });
    await estoque.movimentarBem({ bemId: e.id, data: '2026-11-05', quantidade: 20, origem: externo, destino: galpao });
    expect(totalDoBem(await estoque.movimentosBens(), e.id)).toBe(30);
    const f = await estoque.cadastrarBem({ nome: 'Serra', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: galpao, quantidade: 1, data: '2026-11-01' });
    await expect(estoque.movimentarBem({ bemId: f.id, data: '2026-11-05', quantidade: 1, origem: externo, destino: galpao })).rejects.toThrow('já está cadastrada');
  });

  it('valida quantidade, destino, motivo e datas', async () => {
    const { estoque, joao, riachuelo, campo } = await cenario();
    const f = await estoque.cadastrarBem({ nome: 'Serra', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: galpao, quantidade: 1, data: '2026-11-01' });
    const e = await estoque.cadastrarBem({ nome: 'Escora', tipo: 'locado', controle: 'quantidade', ativo: true, locacao: { locadora: 'Agaé' } }, { posse: galpao, quantidade: 10, data: '2026-11-01' });
    const m = { bemId: f.id, data: '2026-11-02', quantidade: 1, origem: galpao, destino: campo(joao.id, riachuelo.id) };
    await expect(estoque.movimentarBem({ ...m, quantidade: 2 })).rejects.toThrow('Ferramenta individual: a quantidade é sempre 1');
    await expect(estoque.movimentarBem({ ...m, bemId: e.id, quantidade: 0 })).rejects.toThrow('Informe a quantidade');
    await expect(estoque.movimentarBem({ ...m, bemId: e.id, quantidade: 1.5 })).rejects.toThrow('Informe a quantidade');
    await expect(estoque.movimentarBem({ ...m, destino: galpao })).rejects.toThrow('Origem e destino são iguais');
    await expect(estoque.movimentarBem({ ...m, destino: externo })).rejects.toThrow('Informe o motivo da saída');
    await expect(estoque.movimentarBem({ ...m, destino: externo, motivo: 'devolucao-locadora' })).rejects.toThrow('Só equipamento locado volta para a locadora');
    await expect(estoque.movimentarBem({ ...m, origem: externo, destino: externo, motivo: 'perda' })).rejects.toThrow('Origem e destino são iguais');
    await expect(estoque.movimentarBem({ ...m, data: '02/11' })).rejects.toThrow('Data inválida');
    await expect(estoque.movimentarBem({ ...m, prevista: '2026-11-01' })).rejects.toThrow('A devolução prevista não pode ser antes da saída');
    await expect(estoque.movimentarBem({ ...m, bemId: 'x' })).rejects.toThrow('Cadastro não encontrado');
    await estoque.movimentarBem({ ...m, destino: externo, motivo: 'perda' });
    expect(totalDoBem(await estoque.movimentosBens(), f.id)).toBe(0);
  });

  it('edita prazo e observação; cancela com motivo, sem deixar posse negativa', async () => {
    const { estoque, joao, riachuelo, campo } = await cenario();
    const e = await estoque.cadastrarBem({ nome: 'Escora', tipo: 'locado', controle: 'quantidade', ativo: true, locacao: { locadora: 'Agaé' } }, { posse: galpao, quantidade: 10, data: '2026-11-01' });
    const [chegada] = await estoque.movimentosBens();
    const saida = await estoque.movimentarBem({ bemId: e.id, data: '2026-11-02', quantidade: 6, origem: galpao, destino: campo(joao.id, riachuelo.id) });
    const ed = await estoque.editarMovimentoBem(saida.id, { observacao: 'laje 2', prevista: '2026-11-20' });
    expect(ed).toMatchObject({ observacao: 'laje 2', prevista: '2026-11-20' });
    expect(ed.alterado?.nome).toBe('Marilia');
    await expect(estoque.cancelarMovimentoBem(chegada.id, 'engano')).rejects.toThrow('Saldo insuficiente');
    await expect(estoque.cancelarMovimentoBem(saida.id, '  ')).rejects.toThrow('Informe o motivo do cancelamento');
    await estoque.cancelarMovimentoBem(saida.id, 'lançada na obra errada');
    expect(totalDoBem(await estoque.movimentosBens(), e.id)).toBe(10);
    await expect(estoque.editarMovimentoBem(saida.id, { observacao: 'x' })).rejects.toThrow('Lançamento cancelado');
  });

  it('consultor não cadastra nem movimenta', async () => {
    const { estoque } = estoqueDeTeste(ARTHUR);
    await expect(estoque.salvarBem({ nome: 'X', tipo: 'ferramenta', controle: 'unidade', ativo: true })).rejects.toThrow('Sem permissão');
    await expect(estoque.movimentarBem({ bemId: 'a', data: '2026-11-10', quantidade: 1, origem: externo, destino: galpao })).rejects.toThrow('Sem permissão');
  });

  it('alterações entram na fila de envio', async () => {
    const { estoque, armazenamento } = await cenario();
    await estoque.cadastrarBem({ nome: 'Serra', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: galpao, quantidade: 1, data: '2026-11-01' });
    const tabelas = (await armazenamento.fila.listar()).map((p) => p.tabela);
    expect(tabelas).toEqual(expect.arrayContaining(['bens', 'movimentos_bens']));
  });
});
