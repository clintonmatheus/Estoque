import { CLINTON_FIN, ENCARREGADO, financeiroDeTeste, MARILIA, PAGADORA } from '../testes/fabricas';

const BOLETO = '00190.12343 56789.012343 56789.012343 1 16560000123456'; // R$ 1.234,56 · 10/12/2026
const NOTA = { uri: 'file:///nota.jpg', formato: 'imagem' as const, nome: 'nota.jpg' };

async function cenario() {
  const adm = financeiroDeTeste(CLINTON_FIN);
  await adm.financeiro.criarCadastrosIniciais();
  const rmg = await adm.financeiro.salvarCentro({ nome: 'RMG ÁGUA', ativo: true });
  const sms = await adm.financeiro.salvarCentro({ nome: 'SMS', ativo: true });
  const loja = await adm.financeiro.salvarFornecedor({ nome: 'Casa do Construtor', forma: 'fatura', diaFechamento: 'sexta', ativo: true });
  const aco = await adm.financeiro.salvarFornecedor({ nome: 'Aço Potiguar', chavePix: '05948553000275', forma: 'pix', ativo: true });
  const de = (u: typeof ENCARREGADO) => financeiroDeTeste(u, adm.armazenamento).financeiro;
  return { adm: adm.financeiro, pag: de(PAGADORA), enc: de(ENCARREGADO), alm: de(MARILIA), rmg, sms, loja, aco, armazenamento: adm.armazenamento };
}

describe('compras a faturar e fatura semanal', () => {
  it('solicitante e almoxarife lançam compra com comprovante; sem comprovante ou fora da fatura, não', async () => {
    const c = await cenario();
    const base = { fornecedorId: c.loja.id, descricao: 'Cimento CP-II', valor: 450, centroId: c.rmg.id };
    await expect(c.enc.compras.lancar(base, undefined)).rejects.toThrow('Anexe a nota');
    await expect(c.enc.compras.lancar({ ...base, fornecedorId: c.aco.id }, NOTA)).rejects.toThrow('não é loja de fatura');
    const a = await c.enc.compras.lancar(base, NOTA);
    const b = await c.alm.compras.lancar({ ...base, descricao: 'Areia', valor: 100, centroId: c.sms.id }, NOTA);
    expect(a.status).toBe('aberta');
    expect(await c.enc.compras.anexos(a.id)).toHaveLength(1);
    // visibilidade: cada um vê as suas; pagador vê todas
    expect((await c.enc.compras.lista()).map((x) => x.id)).toEqual([a.id]);
    expect((await c.alm.compras.lista()).map((x) => x.id)).toEqual([b.id]);
    expect(await c.pag.compras.lista()).toHaveLength(2);
    const [loja] = await c.pag.compras.emAberto();
    expect(loja.total).toBe(550);
    await expect(c.enc.compras.cancelar(b.id)).rejects.toThrow('que você lançou');
    expect((await c.enc.compras.cancelar(a.id)).status).toBe('cancelada');
  });

  it('fecha a fatura em um pedido: soma confere, diferença exige justificativa, sem centro de custo próprio', async () => {
    const c = await cenario();
    const m = (valor: number, centroId: string) => c.enc.compras.lancar({ fornecedorId: c.loja.id, descricao: 'Material', valor, centroId }, NOTA);
    const x = await m(900, c.rmg.id);
    const y = await m(334.56, c.sms.id);
    const fatura = { tipo: 'boleto' as const, descricao: 'Fatura Casa do Construtor', valor: 1234.56, fornecedorId: c.loja.id, boleto: BOLETO };
    await expect(c.enc.pedidos.solicitar({ ...fatura, fatura: { compras: [x.id, y.id] } })).rejects.toThrow('só o pagador ou o administrador');
    const p = await c.pag.pedidos.solicitar({ ...fatura, fatura: { compras: [x.id, y.id] } });
    expect(p).toMatchObject({ status: 'enviado', aprovador: 'admin', fatura: { soma: 1234.56, compras: [x.id, y.id] } });
    expect(p.centroId).toBeUndefined(); // o custo fica em cada compra (RMG e SMS)
    expect((await c.pag.pedidos.lista())[0].centroId).toBeUndefined();
    expect((await c.pag.compras.lista()).every((k) => k.status === 'em_fatura' && k.pedidoId === p.id)).toBe(true);
    // a mesma compra não entra em duas faturas
    await expect(c.adm.pedidos.solicitar({ ...fatura, descricao: 'Outra', fatura: { compras: [x.id] }, valor: 900, boleto: undefined, tipo: 'pix', chavePix: '05948553000275' })).rejects.toThrow('outra fatura');
  });

  it('diferença entre a fatura e a soma pede justificativa; cancelar o pedido devolve as compras à lista aberta', async () => {
    const c = await cenario();
    const k = await c.enc.compras.lancar({ fornecedorId: c.loja.id, descricao: 'Tinta', valor: 1200, centroId: c.rmg.id }, NOTA);
    const base = { tipo: 'boleto' as const, descricao: 'Fatura', valor: 1234.56, fornecedorId: c.loja.id, boleto: BOLETO, fatura: { compras: [k.id] } };
    await expect(c.adm.pedidos.solicitar(base)).rejects.toThrow('explique a diferença');
    const p = await c.adm.pedidos.solicitar({ ...base, fatura: { compras: [k.id], justificativa: 'Frete da loja' } });
    expect(p.fatura).toMatchObject({ soma: 1200, justificativa: 'Frete da loja' });
    expect((await c.adm.compras.lista())[0].status).toBe('em_fatura');
    await expect(c.adm.compras.cancelar(k.id)).rejects.toThrow('já está numa fatura');
    await c.adm.pedidos.cancelar(p.id, 'Fatura errada');
    const [volta] = await c.adm.compras.lista();
    expect(volta).toMatchObject({ status: 'aberta' });
    expect(volta.pedidoId).toBeUndefined();
  });
});
