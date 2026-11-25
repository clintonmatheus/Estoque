import { estoqueComCadastros } from '../testes/fabricas';

describe('EPI separado do material', () => {
  it('EPI só vai a funcionário de EPI; retirada só de funcionário do galpão; item de EPI não sai por retirada', async () => {
    const { estoque, joao, riachuelo: local } = await estoqueComCadastros();
    const bota = await estoque.salvarItem({ nome: 'Bota', unidade: 'par', estoqueMinimo: 0, ativo: true, categoria: 'EPI' });
    const tinta = await estoque.salvarItem({ nome: 'Tinta', unidade: 'lata', estoqueMinimo: 0, ativo: true });
    const ze = await estoque.salvarFuncionario({ nome: 'Zé', ativo: true, grupo: 'epi' });
    await estoque.lancar({ tipo: 'entrada', data: '2026-11-01', linhas: [{ itemId: bota.id, quantidade: 5 }, { itemId: tinta.id, quantidade: 5 }] });

    await expect(estoque.lancar({ tipo: 'epi', data: '2026-11-02', funcionarioId: joao.id, linhas: [{ itemId: bota.id, quantidade: 1 }] }))
      .rejects.toThrow('João não está cadastrado como funcionário de EPI');
    await expect(estoque.lancar({ tipo: 'epi', data: '2026-11-02', funcionarioId: ze.id, linhas: [{ itemId: tinta.id, quantidade: 1 }] }))
      .rejects.toThrow('TINTA não é um item de EPI');
    await expect(estoque.lancar({ tipo: 'saida', data: '2026-11-02', localId: local.id, funcionarioId: ze.id, linhas: [{ itemId: tinta.id, quantidade: 1 }] }))
      .rejects.toThrow('Zé é funcionário de EPI: não retira material do galpão');
    await expect(estoque.lancar({ tipo: 'saida', data: '2026-11-02', localId: local.id, funcionarioId: joao.id, linhas: [{ itemId: bota.id, quantidade: 1 }] }))
      .rejects.toThrow('BOTA é EPI: lance pela aba EPI');
    await estoque.lancar({ tipo: 'epi', data: '2026-11-02', funcionarioId: ze.id, linhas: [{ itemId: bota.id, quantidade: 1 }] });

    expect((await estoque.itens(false, 'epi')).map((i) => i.nome)).toEqual(['BOTA']);
    expect((await estoque.itens(false, 'material')).map((i) => i.nome)).not.toContain('BOTA');
    expect((await estoque.itens(false, 'material')).map((i) => i.nome)).toContain('TINTA');
    expect((await estoque.funcionarios(false, 'epi')).map((f) => f.nome)).toEqual(['Zé']);
    expect((await estoque.funcionarios(false, 'galpao')).map((f) => f.nome)).toEqual(['João']);
  });

  it('item com lançamentos não muda entre EPI e material; CPF conferido e sem repetir no grupo; dados de EPI só em item de EPI', async () => {
    const { estoque } = await estoqueComCadastros();
    const tinta = await estoque.salvarItem({ nome: 'Tinta', unidade: 'lata', estoqueMinimo: 0, ativo: true, ca: '1', vidaUtilDias: 5 });
    expect(tinta.ca).toBeUndefined();
    await estoque.lancar({ tipo: 'entrada', data: '2026-11-01', linhas: [{ itemId: tinta.id, quantidade: 1 }] });
    await expect(estoque.salvarItem({ ...tinta, categoria: 'EPI' })).rejects.toThrow('já tem lançamentos');
    await expect(estoque.salvarItem({ nome: 'Capacete', unidade: 'un', estoqueMinimo: 0, ativo: true, categoria: 'EPI', vidaUtilDias: 0 })).rejects.toThrow('Vida útil inválida');

    const a = await estoque.salvarFuncionario({ nome: 'Ana', ativo: true, grupo: 'epi', cpf: '529.982.247-25', tamanhos: { calcado: ' 38 ', luva: '' } });
    expect(a).toMatchObject({ cpf: '52998224725', tamanhos: { calcado: '38' } });
    await expect(estoque.salvarFuncionario({ nome: 'Outra', ativo: true, grupo: 'epi', cpf: '52998224725' })).rejects.toThrow('Este CPF já está cadastrado para Ana');
    await expect(estoque.salvarFuncionario({ nome: 'Errada', ativo: true, grupo: 'epi', cpf: '111.111.111-11' })).rejects.toThrow('CPF inválido');
    await estoque.salvarFuncionario({ nome: 'Ana do galpão', ativo: true, cpf: '52998224725' }); // outro grupo: pode
  });

  it('migração: quem já recebeu EPI e nunca retirou material passa a ser de EPI (uma vez)', async () => {
    const { estoque, joao, riachuelo: local } = await estoqueComCadastros();
    const bota = await estoque.salvarItem({ nome: 'Bota', unidade: 'par', estoqueMinimo: 0, ativo: true, categoria: 'EPI' });
    const tinta = await estoque.salvarItem({ nome: 'Tinta', unidade: 'lata', estoqueMinimo: 0, ativo: true });
    const solo = await estoque.salvarFuncionario({ nome: 'Só EPI', ativo: true });
    // dados antigos: entrega de EPI gravada antes da separação
    await estoque.lancar({ tipo: 'entrada', data: '2026-11-01', linhas: [{ itemId: bota.id, quantidade: 5 }, { itemId: tinta.id, quantidade: 5 }] });
    await estoque.salvarFuncionario({ ...solo, grupo: 'epi' });
    await estoque.lancar({ tipo: 'epi', data: '2026-11-02', funcionarioId: solo.id, linhas: [{ itemId: bota.id, quantidade: 1 }] });
    await estoque.salvarFuncionario({ id: solo.id, nome: 'Só EPI', ativo: true }); // volta a "sem grupo", como era antes
    await estoque.lancar({ tipo: 'saida', data: '2026-11-03', localId: local.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 1 }] });
    expect(await estoque.migrarFuncionariosEpi()).toBe(1);
    expect((await estoque.funcionarios(true, 'epi')).map((f) => f.nome)).toEqual(['Só EPI']);
    expect((await estoque.funcionarios(true, 'galpao')).map((f) => f.nome)).toEqual(['João']);
    expect(await estoque.migrarFuncionariosEpi()).toBe(0);
  });
});
