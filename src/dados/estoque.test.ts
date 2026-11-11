import { ARTHUR, CLINTON, estoqueComCadastros, estoqueDeTeste } from '../testes/fabricas';

describe('Estoque — lançamentos', () => {
  it('entrada com nota fiscal e várias linhas, saída para a frente com quem retirou', async () => {
    const { estoque, tinta, piso, riachuelo, joao, armazenamento } = await estoqueComCadastros();
    const entrada = await estoque.lancar({
      tipo: 'entrada', data: '2026-11-10', notaFiscal: ' 1234 ', fornecedor: 'Iquine',
      linhas: [{ itemId: tinta.id, quantidade: 20, custoUnitario: 50 }, { itemId: piso.id, quantidade: 22, custoUnitario: 4.5 }],
    });
    expect(entrada).toHaveLength(2);
    expect(entrada[0].grupo).toBe(entrada[1].grupo);
    expect(entrada[0].notaFiscal).toBe('1234');
    expect(entrada[0].criado.nome).toBe('Marilia');
    await estoque.lancar({ tipo: 'saida', data: '2026-11-11', localId: riachuelo.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 3 }] });
    const p = await estoque.posicao();
    expect(p.itens[tinta.id].quantidade).toBe(17);
    expect(p.locais[riachuelo.id][tinta.id].valor).toBe(150);
    expect((await armazenamento.fila.listar()).filter((x) => x.tabela === 'movimentos')).toHaveLength(3);
  });

  it('bloqueia saída maior que o saldo, com mensagem clara', async () => {
    const { estoque, tinta, riachuelo, joao } = await estoqueComCadastros();
    await estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: tinta.id, quantidade: 2, custoUnitario: 50 }] });
    await expect(estoque.lancar({ tipo: 'saida', data: '2026-11-11', localId: riachuelo.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 3 }] }))
      .rejects.toThrow('Saldo insuficiente: TINTA BRANCA 18L — disponível 2 lata');
    expect(await estoque.movimentos()).toHaveLength(1);
  });

  it('exige os campos de cada tipo', async () => {
    const { estoque, tinta, riachuelo, joao } = await estoqueComCadastros();
    await expect(estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: tinta.id, quantidade: 2 }] })).rejects.toThrow('Informe o valor unitário');
    await expect(estoque.lancar({ tipo: 'saida', data: '2026-11-10', funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 1 }] })).rejects.toThrow('Informe a frente de serviço de destino');
    await expect(estoque.lancar({ tipo: 'saida', data: '2026-11-10', localId: riachuelo.id, linhas: [{ itemId: tinta.id, quantidade: 1 }] })).rejects.toThrow('Informe quem retirou');
    await expect(estoque.lancar({ tipo: 'transferencia', data: '2026-11-10', localId: riachuelo.id, localDestinoId: riachuelo.id, linhas: [{ itemId: tinta.id, quantidade: 1 }] })).rejects.toThrow('Origem e destino devem ser diferentes');
    await expect(estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [] })).rejects.toThrow('Inclua pelo menos um item');
    await expect(estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: tinta.id, quantidade: 0, custoUnitario: 1 }] })).rejects.toThrow('Quantidade inválida');
  });

  it('devolução maior que o entregue à frente é bloqueada', async () => {
    const { estoque, tinta, riachuelo, macaiba, joao } = await estoqueComCadastros();
    await estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: tinta.id, quantidade: 5, custoUnitario: 50 }] });
    await estoque.lancar({ tipo: 'saida', data: '2026-11-10', localId: riachuelo.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 2 }] });
    await expect(estoque.lancar({ tipo: 'devolucao', data: '2026-11-11', localId: macaiba.id, linhas: [{ itemId: tinta.id, quantidade: 1 }] }))
      .rejects.toThrow('Quantidade maior que a entregue: TINTA BRANCA 18L — Macaíba tem 0 lata');
  });
});

describe('Estoque — correções', () => {
  it('edita registrando quem alterou, e bloqueia edição que deixaria saldo negativo', async () => {
    const { estoque, tinta, riachuelo, joao } = await estoqueComCadastros();
    const [e] = await estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: tinta.id, quantidade: 5, custoUnitario: 50 }] });
    await estoque.lancar({ tipo: 'saida', data: '2026-11-11', localId: riachuelo.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 4 }] });
    const ed = await estoque.editarMovimento(e.id, { custoUnitario: 52, notaFiscal: '99' });
    expect(ed.alterado?.nome).toBe('Marilia');
    expect((await estoque.posicao()).locais[riachuelo.id][tinta.id].valor).toBe(208);
    await expect(estoque.editarMovimento(e.id, { quantidade: 3 })).rejects.toThrow('Saldo insuficiente');
  });

  it('cancela com motivo; não cancela entrada já consumida', async () => {
    const { estoque, tinta, riachuelo, joao } = await estoqueComCadastros();
    const [e] = await estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: tinta.id, quantidade: 5, custoUnitario: 50 }] });
    const [s] = await estoque.lancar({ tipo: 'saida', data: '2026-11-11', localId: riachuelo.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 4 }] });
    await expect(estoque.cancelarMovimento(e.id, 'duplicada')).rejects.toThrow('Saldo insuficiente');
    await expect(estoque.cancelarMovimento(s.id, ' ')).rejects.toThrow('Informe o motivo');
    const c = await estoque.cancelarMovimento(s.id, 'lançada errado');
    expect(c.cancelado?.motivo).toBe('lançada errado');
    expect((await estoque.posicao()).itens[tinta.id].quantidade).toBe(5);
    await expect(estoque.editarMovimento(s.id, { quantidade: 1 })).rejects.toThrow('Lançamento cancelado');
  });
});

describe('Estoque — editar lançamento inteiro', () => {
  it('muda data e frente de todas as linhas, validando saldo', async () => {
    const { estoque, tinta, piso, riachuelo, macaiba, joao } = await estoqueComCadastros();
    await estoque.lancar({ tipo: 'entrada', data: '2026-11-05', linhas: [{ itemId: tinta.id, quantidade: 5, custoUnitario: 50 }, { itemId: piso.id, quantidade: 11, custoUnitario: 4 }] });
    const s = await estoque.lancar({ tipo: 'saida', data: '2026-11-10', localId: riachuelo.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 1 }, { itemId: piso.id, quantidade: 3 }] });
    const ed = await estoque.editarGrupo(s[0].grupo, { localId: macaiba.id, observacao: 'pedido por foto' });
    expect(ed.map((m) => [m.localId, m.observacao])).toEqual([[macaiba.id, 'pedido por foto'], [macaiba.id, 'pedido por foto']]);
    await expect(estoque.editarGrupo(s[0].grupo, { data: '2026-11-01' })).rejects.toThrow('Saldo insuficiente');
  });
});

describe('Estoque — inventário', () => {
  it('gera ajustes só para as diferenças; contagem inicial usa o custo de referência', async () => {
    const { estoque, armazenamento } = estoqueDeTeste(CLINTON);
    expect(await estoque.importarItensIniciais()).toBe(45);
    expect(await estoque.importarItensIniciais()).toBe(0);
    const itens = await armazenamento.itens.listar();
    const broxa = itens.find((i) => i.nome === 'BROXA')!;
    const piso = itens.find((i) => i.nome.startsWith('REVESTIMENTO'))!;
    const aj = await estoque.registrarInventario('2026-11-11', [{ itemId: broxa.id, contado: 10 }, { itemId: piso.id, contado: 0 }]);
    expect(aj).toHaveLength(1);
    const p = await estoque.posicao();
    expect(p.itens[broxa.id].valor).toBeCloseTo(88);
    const aj2 = await estoque.registrarInventario('2026-11-12', [{ itemId: broxa.id, contado: 8 }]);
    expect(aj2[0].quantidade).toBe(-2);
    expect((await estoque.posicao()).itens[broxa.id].quantidade).toBe(8);
  });
});

describe('Estoque — permissões e cadastros', () => {
  it('consultor não lança nem cadastra', async () => {
    const { estoque } = estoqueDeTeste(ARTHUR);
    await expect(estoque.salvarItem({ nome: 'X', unidade: 'un', estoqueMinimo: 0, ativo: true })).rejects.toThrow('Sem permissão');
    await expect(estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [] })).rejects.toThrow('Sem permissão');
  });
  it('não aceita item com nome repetido; edição mantém o criador', async () => {
    const { estoque, tinta } = await estoqueComCadastros();
    await expect(estoque.salvarItem({ nome: 'tinta branca 18l', unidade: 'lata', estoqueMinimo: 0, ativo: true })).rejects.toThrow('Já existe um item');
    const ed = await estoque.salvarItem({ ...tinta, estoqueMinimo: 5 });
    expect(ed.criado).toEqual(tinta.criado);
    expect(ed.alterado).toBeDefined();
  });
  it('frente de serviço exige centro de custo; lista agrupada por contrato', async () => {
    const { estoque } = await estoqueComCadastros();
    await expect(estoque.salvarLocal({ nome: 'Pedra Grande', centroCusto: '', ativo: true })).rejects.toThrow('centro de custo');
    await estoque.salvarLocal({ nome: 'UBS', centroCusto: 'Contrato 029/2025', ativo: true });
    expect((await estoque.locais()).map((l) => l.nome)).toEqual(['UBS', 'Macaíba', 'Riachuelo']);
  });
});
