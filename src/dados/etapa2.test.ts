import { gastosPorLocal } from '../domain/estoque';
import { ARTHUR, estoqueComCadastros, estoqueDeTeste } from '../testes/fabricas';

async function comBota() {
  const t = await estoqueComCadastros();
  const bota = await t.estoque.salvarItem({ nome: 'Bota de segurança', unidade: 'par', estoqueMinimo: 0, ativo: true, categoria: 'EPI' });
  await t.estoque.lancar({ tipo: 'entrada', data: '2026-11-01', linhas: [{ itemId: bota.id, quantidade: 10, custoUnitario: 80 }] });
  return { ...t, bota };
}

describe('Estoque — entrega de EPI', () => {
  it('baixa o galpão (PEPS) guardando CA, tamanho e validade, sem custo para frente de serviço', async () => {
    const { estoque, bota, joao } = await comBota();
    const [m] = await estoque.lancar({
      tipo: 'epi', data: '2026-11-10', funcionarioId: joao.id,
      linhas: [{ itemId: bota.id, quantidade: 1, ca: ' 12345 ', tamanho: '42', validade: '2027-05-10' }],
    });
    expect(m).toMatchObject({ tipo: 'epi', funcionarioId: joao.id, ca: '12345', tamanho: '42', validade: '2027-05-10' });
    expect(m.localId).toBeUndefined();
    const p = await estoque.posicao();
    expect(p.itens[bota.id].quantidade).toBe(9);
    expect(p.custos[m.id].valor).toBe(80);
    expect(gastosPorLocal(await estoque.movimentos(), p, { inicio: '2026-11-01', fim: '2026-11-30' })).toEqual([]);
  });

  it('exige funcionário, bloqueia saldo insuficiente e valida a data de validade', async () => {
    const { estoque, bota, joao } = await comBota();
    await expect(estoque.lancar({ tipo: 'epi', data: '2026-11-10', linhas: [{ itemId: bota.id, quantidade: 1 }] })).rejects.toThrow('Informe o funcionário');
    await expect(estoque.lancar({ tipo: 'epi', data: '2026-11-10', funcionarioId: joao.id, linhas: [{ itemId: bota.id, quantidade: 11 }] })).rejects.toThrow('Saldo insuficiente');
    await expect(estoque.lancar({ tipo: 'epi', data: '2026-11-10', funcionarioId: joao.id, linhas: [{ itemId: bota.id, quantidade: 1, validade: '10/05/2027' }] })).rejects.toThrow('Data de validade inválida');
  });

  it('pode ser cancelada com motivo, devolvendo o saldo', async () => {
    const { estoque, bota, joao } = await comBota();
    const [m] = await estoque.lancar({ tipo: 'epi', data: '2026-11-10', funcionarioId: joao.id, linhas: [{ itemId: bota.id, quantidade: 2 }] });
    await estoque.cancelarMovimento(m.id, 'lançado errado');
    expect((await estoque.posicao()).itens[bota.id].quantidade).toBe(10);
  });

  it('edita CA, tamanho e validade registrando quem alterou', async () => {
    const { estoque, bota, joao } = await comBota();
    const [m] = await estoque.lancar({ tipo: 'epi', data: '2026-11-10', funcionarioId: joao.id, linhas: [{ itemId: bota.id, quantidade: 1, ca: '1' }] });
    const e = await estoque.editarMovimento(m.id, { ca: '999', tamanho: '41', validade: '2027-01-01' });
    expect(e).toMatchObject({ ca: '999', tamanho: '41', validade: '2027-01-01' });
    expect(e.alterado?.nome).toBe('Marilia');
  });
});

describe('Estoque — ferramentas e empréstimos', () => {
  it('cadastra ferramenta individual e não aceita repetida (mesmo nome e código)', async () => {
    const { estoque } = estoqueDeTeste();
    const f = await estoque.salvarFerramenta({ nome: ' Furadeira ', codigo: '03', ativo: true });
    expect(f.nome).toBe('FURADEIRA');
    await expect(estoque.salvarFerramenta({ nome: 'furadeira', codigo: '03', ativo: true })).rejects.toThrow('Já existe essa ferramenta');
    await estoque.salvarFerramenta({ nome: 'Furadeira', codigo: '04', ativo: true });
    await expect(estoque.salvarFerramenta({ nome: ' ', ativo: true })).rejects.toThrow('Informe o nome da ferramenta');
    expect((await estoque.ferramentas()).map((x) => x.codigo)).toEqual(['03', '04']);
  });

  it('empresta com prazo, impede emprestar a que já está fora e registra a devolução', async () => {
    const { estoque, joao, riachuelo } = await estoqueComCadastros();
    const f = await estoque.salvarFerramenta({ nome: 'Escada 7 degraus', ativo: true });
    const e = await estoque.emprestar({ ferramentaId: f.id, funcionarioId: joao.id, localId: riachuelo.id, saida: '2026-11-10', prevista: '2026-11-17' });
    expect(e).toMatchObject({ saida: '2026-11-10', prevista: '2026-11-17', localId: riachuelo.id });
    await expect(estoque.emprestar({ ferramentaId: f.id, funcionarioId: joao.id, saida: '2026-11-11', prevista: '2026-11-12' }))
      .rejects.toThrow('ESCADA 7 DEGRAUS já está com João');
    const d = await estoque.devolverFerramenta(e.id, { devolvidoEm: '2026-11-12', observacaoDevolucao: ' cabo solto ' });
    expect(d).toMatchObject({ devolvidoEm: '2026-11-12', observacaoDevolucao: 'cabo solto' });
    expect(d.devolvido?.nome).toBe('Marilia');
    await expect(estoque.devolverFerramenta(e.id, { devolvidoEm: '2026-11-13' })).rejects.toThrow('já foi devolvida');
    await estoque.emprestar({ ferramentaId: f.id, funcionarioId: joao.id, saida: '2026-11-13', prevista: '2026-11-20' }); // pode sair de novo
  });

  it('valida datas, funcionário e ferramenta ativa', async () => {
    const { estoque, joao } = await estoqueComCadastros();
    const f = await estoque.salvarFerramenta({ nome: 'Serra', ativo: true });
    const base = { ferramentaId: f.id, funcionarioId: joao.id, saida: '2026-11-10', prevista: '2026-11-12' };
    await expect(estoque.emprestar({ ...base, funcionarioId: '' })).rejects.toThrow('Informe quem retirou');
    await expect(estoque.emprestar({ ...base, prevista: '2026-11-09' })).rejects.toThrow('A devolução prevista não pode ser antes da saída');
    await expect(estoque.emprestar({ ...base, prevista: '12/11' })).rejects.toThrow('Data inválida');
    await estoque.salvarFerramenta({ ...f, ativo: false });
    await expect(estoque.emprestar(base)).rejects.toThrow('Ferramenta inativa');
    await expect(estoque.devolverFerramenta('nao-existe', { devolvidoEm: '2026-11-10' })).rejects.toThrow('Empréstimo não encontrado');
  });

  it('devolução não pode ser antes da saída; edição e cancelamento exigem motivo e liberam a ferramenta', async () => {
    const { estoque, joao } = await estoqueComCadastros();
    const f = await estoque.salvarFerramenta({ nome: 'Serra', ativo: true });
    const e = await estoque.emprestar({ ferramentaId: f.id, funcionarioId: joao.id, saida: '2026-11-10', prevista: '2026-11-12' });
    await expect(estoque.devolverFerramenta(e.id, { devolvidoEm: '2026-11-09' })).rejects.toThrow('A devolução não pode ser antes da saída');
    const ed = await estoque.editarEmprestimo(e.id, { prevista: '2026-11-15', observacao: 'obra 2' });
    expect(ed).toMatchObject({ prevista: '2026-11-15', observacao: 'obra 2' });
    expect(ed.alterado?.nome).toBe('Marilia');
    await expect(estoque.cancelarEmprestimo(e.id, ' ')).rejects.toThrow('Informe o motivo do cancelamento');
    await estoque.cancelarEmprestimo(e.id, 'lançado por engano');
    await estoque.emprestar({ ferramentaId: f.id, funcionarioId: joao.id, saida: '2026-11-11', prevista: '2026-11-12' });
    expect((await estoque.emprestimos()).filter((x) => !x.cancelado)).toHaveLength(1);
  });

  it('consultor não lança nem cadastra ferramentas', async () => {
    const { estoque } = estoqueDeTeste(ARTHUR);
    await expect(estoque.salvarFerramenta({ nome: 'X', ativo: true })).rejects.toThrow('Sem permissão');
    await expect(estoque.emprestar({ ferramentaId: 'a', funcionarioId: 'b', saida: '2026-11-10', prevista: '2026-11-11' })).rejects.toThrow('Sem permissão');
  });

  it('as alterações entram na fila de envio', async () => {
    const { estoque, joao, armazenamento } = await estoqueComCadastros();
    const f = await estoque.salvarFerramenta({ nome: 'Serra', ativo: true });
    await estoque.emprestar({ ferramentaId: f.id, funcionarioId: joao.id, saida: '2026-11-10', prevista: '2026-11-12' });
    const tabelas = (await armazenamento.fila.listar()).map((p) => p.tabela);
    expect(tabelas).toContain('ferramentas');
    expect(tabelas).toContain('emprestimos');
  });
});
