import { percentualNoMes } from '../domain/meses';
import { CLINTON_FIN, estoqueComCadastros, financeiroDeTeste, MARILIA, PAGADORA } from '../testes/fabricas';
import { Financeiro } from './financeiro';

async function comEmpresa() {
  const t = financeiroDeTeste();
  const aln = await t.financeiro.salvarEmpresa({ apelido: ' ALN ', nome: 'A. L. N. Serviços e Construções Ltda.', ativo: true });
  return { ...t, aln };
}

describe('Financeiro — cadastros', () => {
  it('só o administrador do financeiro altera; pagador e almoxarife não', async () => {
    const { armazenamento } = financeiroDeTeste();
    for (const u of [PAGADORA, MARILIA]) {
      const f = new Financeiro(armazenamento, u, { agora: () => '2026-11-24T12:00:00.000Z', novoId: () => 'x' });
      expect(f.podeEditar).toBe(false);
      await expect(f.salvarEmpresa({ apelido: 'ALN', nome: 'ALN', ativo: true })).rejects.toThrow('Sem permissão');
    }
    expect(await armazenamento.fila.listar()).toEqual([]);
  });

  it('empresa: nome curto único e CNPJ conferido', async () => {
    const { financeiro, aln } = await comEmpresa();
    expect(aln.apelido).toBe('ALN');
    await expect(financeiro.salvarEmpresa({ apelido: 'aln', nome: 'Outra', ativo: true })).rejects.toThrow('Já existe a empresa aln');
    await expect(financeiro.salvarEmpresa({ apelido: 'Passos', nome: 'Construtora Passos', cnpj: '11.111.111/1111-11', ativo: true })).rejects.toThrow('CPF/CNPJ inválido');
    const p = await financeiro.salvarEmpresa({ apelido: 'Passos', nome: 'Construtora Passos', cnpj: '05.948.553/0002-75', ativo: true });
    expect(p.cnpj).toBe('05948553000275');
  });

  it('conta: apelido automático e único', async () => {
    const { financeiro, aln } = await comEmpresa();
    const c = await financeiro.salvarConta({ empresaId: aln.id, banco: 'Banco do Brasil', agencia: ' 1234 ', ativo: true });
    expect(c).toMatchObject({ apelido: 'BB ALN', agencia: '1234' });
    await expect(financeiro.salvarConta({ empresaId: aln.id, banco: 'Banco do Brasil', ativo: true })).rejects.toThrow('Já existe a conta BB ALN');
    await expect(financeiro.salvarConta({ empresaId: 'nada', banco: 'Inter', ativo: true })).rejects.toThrow('Escolha a empresa');
  });

  it('centro de custo: empresa opcional; administração e galpão são um só', async () => {
    const { financeiro, aln } = await comEmpresa();
    const funpec = await financeiro.salvarCentro({ nome: 'FUNPEC', ativo: true });
    expect(funpec.empresaId).toBeUndefined();
    await expect(financeiro.salvarCentro({ nome: 'X', empresaId: 'nada', ativo: true })).rejects.toThrow('Escolha a empresa');
    await financeiro.salvarCentro({ nome: 'Administração', especial: 'administracao', ativo: true });
    await expect(financeiro.salvarCentro({ nome: 'Adm Passos', empresaId: aln.id, especial: 'administracao', ativo: true }))
      .rejects.toThrow('Já existe o centro Administração: a administração é um só para as duas empresas');
  });

  it('centro de custo: nome e outros nomes não se repetem entre centros', async () => {
    const { financeiro, aln } = await comEmpresa();
    const rmg = await financeiro.salvarCentro({ nome: 'RMG Água', empresaId: aln.id, apelidos: ['RMG AGUA', 'rmg água', 'Caixa RMG'], ativo: true });
    expect(rmg.apelidos).toEqual(['Caixa RMG']);
    await expect(financeiro.salvarCentro({ nome: 'caixa rmg', empresaId: aln.id, ativo: true })).rejects.toThrow('já é usado pelo centro de custo RMG Água');
  });

  it('liga as frentes do estoque ao centro e acompanha a mudança de nome', async () => {
    const e = await estoqueComCadastros();
    const { financeiro } = financeiroDeTeste(CLINTON_FIN, e.armazenamento);
    const aln = await financeiro.salvarEmpresa({ apelido: 'ALN', nome: 'ALN', ativo: true });
    expect((await financeiro.frentesSemCentro()).map((g) => [g.texto, g.frentes.length])).toEqual([['Escritórios da RMG', 2]]);
    const centro = await financeiro.salvarCentro({ nome: 'Escritórios RMG', empresaId: aln.id, ativo: true });
    expect(await financeiro.vincularFrentes('Escritórios da RMG', centro.id)).toBe(2);
    expect(await financeiro.frentesSemCentro()).toEqual([]);
    const ligado = (await financeiro.centros())[0];
    expect(ligado.apelidos).toEqual(['Escritórios da RMG']);
    const riachuelo = (await e.estoque.locais()).find((l) => l.nome === 'Riachuelo')!;
    expect(riachuelo).toMatchObject({ centroId: centro.id, centroCusto: 'Escritórios RMG' });

    await financeiro.salvarCentro({ ...ligado, nome: 'RMG Escritórios' });
    expect((await e.estoque.locais()).every((l) => l.centroCusto === 'RMG Escritórios')).toBe(true);

    // No estoque, editar só o nome da frente mantém a ligação; trocar o contrato desfaz.
    const r1 = await e.estoque.salvarLocal({ id: riachuelo.id, nome: 'Riachuelo II', centroCusto: 'RMG Escritórios', ativo: true });
    expect(r1.centroId).toBe(centro.id);
    const r2 = await e.estoque.salvarLocal({ id: riachuelo.id, nome: 'Riachuelo II', centroCusto: 'Outro contrato', ativo: true });
    expect(r2.centroId).toBeUndefined();
  });

  it('frente nova dentro do centro, sem repetir nome no mesmo centro', async () => {
    const { financeiro, aln } = await comEmpresa();
    const rmg = await financeiro.salvarCentro({ nome: 'RMG Água', empresaId: aln.id, ativo: true });
    const f = await financeiro.salvarFrente({ nome: 'RMG Pureza', centroId: rmg.id, ativo: true });
    expect(f).toMatchObject({ centroCusto: 'RMG Água', centroId: rmg.id });
    await expect(financeiro.salvarFrente({ nome: 'rmg pureza', centroId: rmg.id, ativo: true })).rejects.toThrow('Já existe a frente RMG Pureza');
  });

  it('fornecedor: documento, chave Pix e dia de fechamento só na fatura', async () => {
    const { financeiro } = financeiroDeTeste();
    await expect(financeiro.salvarFornecedor({ nome: 'Aço Potiguar', forma: 'pix', ativo: true })).rejects.toThrow('Informe a chave Pix');
    const aco = await financeiro.salvarFornecedor({ nome: 'Aço Potiguar', documento: '05.948.553/0002-75', chavePix: '05948553000275', forma: 'pix', diaFechamento: 'sexta', ativo: true });
    expect(aco).toMatchObject({ documento: '05948553000275', chavePix: '05948553000275' });
    expect(aco.diaFechamento).toBeUndefined();
    await expect(financeiro.salvarFornecedor({ nome: 'Outro nome', documento: '05948553000275', forma: 'boleto', ativo: true })).rejects.toThrow('já está no fornecedor Aço Potiguar');
    await expect(financeiro.salvarFornecedor({ nome: 'aço potiguar', forma: 'boleto', ativo: true })).rejects.toThrow('Já existe o fornecedor Aço Potiguar');
    const loja = await financeiro.salvarFornecedor({ nome: 'Casa do Construtor', forma: 'fatura', diaFechamento: 'sexta', ativo: true });
    expect(loja.diaFechamento).toBe('sexta');
  });

  it('cadastros iniciais: ALN e Passos, contas, Administração e Galpão (um de cada), tipos; repetir não duplica', async () => {
    const { financeiro, armazenamento } = financeiroDeTeste();
    expect(await financeiro.criarCadastrosIniciais()).toEqual({ empresas: 2, contas: 6, centros: 2, tipos: 20, encargos: 2 });
    expect((await financeiro.contas()).map((c) => c.apelido)).toEqual(['BB ALN', 'BB Passos', 'Inter ALN', 'Inter Passos', 'Itaú Passos', 'Nubank Passos']);
    expect((await financeiro.centros()).map((c) => `${c.nome}:${c.especial}`)).toEqual([
      'Administração:administracao', 'Estoque/Galpão:galpao',
    ]);
    expect((await financeiro.centros()).every((c) => c.empresaId === undefined)).toBe(true);
    expect(await financeiro.criarCadastrosIniciais()).toEqual({ empresas: 0, contas: 0, centros: 0, tipos: 0, encargos: 0 });
    expect((await armazenamento.fila.listar()).length).toBe(2 + 6 + 2 + 20 + 2);
  });

  it('custos fixos mensais no centro: RMG Água R$ 20.000 desde 08/2026, tipo Despesa geral', async () => {
    const { financeiro } = financeiroDeTeste();
    await financeiro.criarCadastrosIniciais();
    const rmg = await financeiro.salvarCentro({ nome: 'RMG ÁGUA', ativo: true });
    await expect(financeiro.salvarCustoFixo(rmg.id, { descricao: 'Despesa geral', tipo: 'Nada', valor: 1, inicio: '2026-08' })).rejects.toThrow('Tipo de despesa "Nada" não cadastrado');
    await expect(financeiro.salvarCustoFixo(rmg.id, { descricao: 'Despesa geral', tipo: 'Despesa geral', valor: 20000, inicio: '08/2026' })).rejects.toThrow('Informe o mês de início');
    await expect(financeiro.salvarCustoFixo(rmg.id, { descricao: 'X', tipo: 'despesa geral', valor: 1, inicio: '2026-08', fim: '2026-07' })).rejects.toThrow('O fim não pode ser antes do início');
    const cf = await financeiro.salvarCustoFixo(rmg.id, { descricao: 'Despesa geral', tipo: 'DESPESA GERAL', valor: 20000, inicio: '2026-08' });
    expect(cf).toMatchObject({ descricao: 'Despesa geral', tipo: 'Despesa geral', valor: 20000, inicio: '2026-08' });
    await financeiro.salvarCustoFixo(rmg.id, { ...cf, valor: 21000 });
    expect((await financeiro.centros()).find((c) => c.id === rmg.id)?.custosFixos).toEqual([{ ...cf, valor: 21000 }]);
    await financeiro.removerCustoFixo(rmg.id, cf.id);
    expect((await financeiro.centros()).find((c) => c.id === rmg.id)?.custosFixos).toEqual([]);
  });

  it('encargos: 37,77% e 67,05% iniciais; mudança vale a partir do mês escolhido e guarda o histórico', async () => {
    const { financeiro } = financeiroDeTeste();
    await financeiro.criarCadastrosIniciais();
    const [folha, especiais] = await financeiro.encargos();
    expect([folha.nome, folha.vigencias]).toEqual(['Encargos da folha', [{ desde: '2000-01', percentual: 37.77 }]]);
    expect(especiais.vigencias).toEqual([{ desde: '2000-01', percentual: 67.05 }]);
    await expect(financeiro.definirPercentual(folha.id, '2027-01', 300)).rejects.toThrow('Percentual inválido');
    const novo = await financeiro.definirPercentual(folha.id, '2027-01', 35);
    expect(novo.vigencias).toEqual([{ desde: '2000-01', percentual: 37.77 }, { desde: '2027-01', percentual: 35 }]);
    expect(percentualNoMes(novo.vigencias, '2026-12')).toBe(37.77);
    expect(percentualNoMes(novo.vigencias, '2027-03')).toBe(35);
    const { financeiro: pag } = financeiroDeTeste(PAGADORA);
    await expect(pag.definirPercentual(folha.id, '2027-01', 30)).rejects.toThrow('Sem permissão');
  });
});
