import { Estoque } from './estoque';
import { podeConferir, podeLancar, podePagar, operaControle, veEstoque, veFinanceiro } from '../domain/tipos';
import { ARTHUR_FIN, CLINTON_FIN, ENCARREGADO, estoqueComCadastros, financeiroDeTeste, JOANA, MARILIA_SOL, PAGADORA } from '../testes/fabricas';

const comoOutro = (e: Estoque, u: typeof JOANA, a: Parameters<typeof financeiroDeTeste>[1]) =>
  new Estoque(a!, u, { agora: () => '2026-11-25T12:00:00.000Z', novoId: (() => { let n = 0; return () => `${u.id}-${++n}`; })() });

describe('permissões por pilar', () => {
  it('quem vê e faz o quê em cada pilar', () => {
    const quem = { Clinton: CLINTON_FIN, Marilia: MARILIA_SOL, Joana: JOANA, Arthur: ARTHUR_FIN, Caio: ENCARREGADO };
    const tabela = Object.fromEntries(Object.entries(quem).map(([n, u]) => [n, {
      estoque: veEstoque(u), materiais: podeLancar(u), controle: operaControle(u), confere: podeConferir(u), paga: podePagar(u), financeiro: veFinanceiro(u),
    }]));
    expect(tabela).toEqual({
      Clinton: { estoque: true, materiais: true, controle: true, confere: true, paga: true, financeiro: true },
      Marilia: { estoque: true, materiais: true, controle: true, confere: false, paga: false, financeiro: false },
      Joana: { estoque: true, materiais: false, controle: true, confere: true, paga: true, financeiro: false },
      Arthur: { estoque: true, materiais: false, controle: false, confere: true, paga: false, financeiro: true },
      Caio: { estoque: false, materiais: false, controle: false, confere: false, paga: false, financeiro: false },
    });
  });

  it('controle (Joana): lança e cadastra EPI, ferramentas e funcionários; materiais não', async () => {
    const c = await estoqueComCadastros();
    const bota = await c.estoque.salvarItem({ nome: 'Bota', unidade: 'par', estoqueMinimo: 0, ativo: true, categoria: 'EPI' });
    await c.estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: c.tinta.id, quantidade: 5 }, { itemId: bota.id, quantidade: 5 }] });
    const joana = comoOutro(c.estoque, JOANA, c.armazenamento);
    const ze = await joana.salvarFuncionario({ nome: 'Zé', ativo: true, grupo: 'epi' });
    const [entrega] = await joana.lancar({ tipo: 'epi', data: '2026-11-11', funcionarioId: ze.id, linhas: [{ itemId: bota.id, quantidade: 1 }] });
    await joana.lancar({ tipo: 'entrada', data: '2026-11-11', linhas: [{ itemId: bota.id, quantidade: 2 }] });
    await joana.editarMovimento(entrega.id, { tamanho: '41' });
    await joana.salvarItem({ nome: 'Luva', unidade: 'par', estoqueMinimo: 0, ativo: true, categoria: 'EPI' });
    await joana.registrarInventario('2026-11-12', [{ itemId: bota.id, contado: 6 }]);
    await joana.cadastrarBem({ nome: 'Betoneira', tipo: 'locado', controle: 'unidade', ativo: true, locacao: { locadora: 'Agaé' } }, { posse: { tipo: 'galpao' }, quantidade: 1, data: '2026-11-12' });

    const msg = 'você movimenta só EPI';
    await expect(joana.lancar({ tipo: 'saida', data: '2026-11-12', localId: c.riachuelo.id, funcionarioId: c.joao.id, linhas: [{ itemId: c.tinta.id, quantidade: 1 }] })).rejects.toThrow(msg);
    const [mat] = (await joana.movimentos()).filter((m) => m.itemId === c.tinta.id);
    await expect(joana.cancelarMovimento(mat.id, 'erro')).rejects.toThrow(msg);
    await expect(joana.editarMovimento(mat.id, { quantidade: 1 })).rejects.toThrow(msg);
    await expect(joana.registrarInventario('2026-11-12', [{ itemId: c.tinta.id, contado: 0 }])).rejects.toThrow(msg);
    await expect(joana.salvarItem({ nome: 'Areia', unidade: 'm3', estoqueMinimo: 0, ativo: true })).rejects.toThrow('só itens de EPI');
    await expect(joana.salvarItem({ ...c.tinta, categoria: 'EPI' })).rejects.toThrow('só itens de EPI');
    await expect(joana.salvarLocal({ nome: 'Obra nova', centroCusto: 'X', ativo: true })).rejects.toThrow('Sem permissão');
  });

  it('consultor (Arthur, Daniel) vê o estoque, mas não lança nada', async () => {
    const c = await estoqueComCadastros();
    const arthur = comoOutro(c.estoque, ARTHUR_FIN, c.armazenamento);
    expect((await arthur.itens()).length).toBeGreaterThan(0);
    await expect(arthur.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: c.tinta.id, quantidade: 1 }] })).rejects.toThrow('Sem permissão');
    await expect(arthur.salvarFuncionario({ nome: 'X', ativo: true })).rejects.toThrow('Sem permissão');
    await expect(arthur.cadastrarBem({ nome: 'X', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: { tipo: 'galpao' }, quantidade: 1, data: '2026-11-10' })).rejects.toThrow('Sem permissão');
  });

  it('administrador que não paga confere e aprova; só o pagador (ou o admin marcado) paga', async () => {
    const adm = financeiroDeTeste(CLINTON_FIN);
    await adm.financeiro.criarCadastrosIniciais();
    const centro = await adm.financeiro.salvarCentro({ nome: 'RMG', ativo: true });
    const arthur = financeiroDeTeste(ARTHUR_FIN, adm.armazenamento).financeiro;
    const joana = financeiroDeTeste(JOANA, adm.armazenamento).financeiro;
    const caio = financeiroDeTeste(ENCARREGADO, adm.armazenamento).financeiro;
    const p = await caio.pedidos.solicitar({ tipo: 'pix', descricao: 'Aço', valor: 900, centroId: centro.id, favorecido: 'Loja', chavePix: 'loja@x.com' });
    expect((await arthur.pedidos.conferir(p.id)).status).toBe('pronto'); // admin confere e já aprova
    const emp = (await arthur.empresas())[0];
    const conta = (await arthur.contas()).find((x) => x.empresaId === emp.id)!;
    const dados = { data: '2026-11-24', empresaId: emp.id, contaId: conta.id, valor: 900 };
    await expect(arthur.pedidos.pagar(p.id, dados)).rejects.toThrow('só o pagador');
    expect((await joana.pedidos.pagar(p.id, dados)).status).toBe('pago');
    void PAGADORA;
  });
});
