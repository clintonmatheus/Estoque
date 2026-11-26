import { CLINTON_FIN, ENCARREGADO, financeiroDeTeste, PAGADORA } from '../testes/fabricas';
import { notasPendentes, passaNoFiltro, quemPagou, resumoNotas } from '../domain/pedidos';
import type { NovoPedido } from './pedidos';

async function cenario() {
  const adm = financeiroDeTeste(CLINTON_FIN);
  await adm.financeiro.criarCadastrosIniciais();
  const centro = await adm.financeiro.salvarCentro({ nome: 'RMG ÁGUA', ativo: true });
  const terc = await adm.financeiro.salvarFornecedor({ nome: 'Pintura Silva ME', chavePix: '05948553000275', forma: 'pix', ativo: true });
  const aln = (await adm.financeiro.empresas()).find((e) => e.apelido === 'ALN')!;
  const passos = (await adm.financeiro.empresas()).find((e) => e.apelido !== 'ALN')!;
  const contaAln = (await adm.financeiro.contas()).find((c) => c.empresaId === aln.id)!;
  const por = (u: typeof ENCARREGADO) => financeiroDeTeste(u, adm.armazenamento).financeiro.pedidos;
  const base: NovoPedido = { tipo: 'pix', descricao: 'Pintura do bloco B', valor: 5000, centroId: centro.id, fornecedorId: terc.id, terceirizado: true };
  return { adm: adm.financeiro.pedidos, pag: por(PAGADORA), enc: por(ENCARREGADO), aln, passos, contaAln, centro, terc, base, armazenamento: adm.armazenamento };
}

/** Pedido de terceirizado já pago (R$ 5.000 em 24/11). */
async function pago(c: Awaited<ReturnType<typeof cenario>>, valor = 5000) {
  const p = await c.adm.solicitar({ ...c.base, valor });
  await c.adm.conferir(p.id);
  await c.adm.aprovar(p.id).catch(() => undefined);
  return c.adm.pagar(p.id, { data: '2026-11-20', empresaId: c.aln.id, contaId: c.contaAln.id, valor });
}

describe('pagamento a terceirizado: notas que chegam depois', () => {
  it('só pagador e administrador abrem; o pedido guarda a lista de notas vazia', async () => {
    const c = await cenario();
    await expect(c.enc.solicitar(c.base)).rejects.toThrow('só o pagador ou o administrador abre pagamento a terceirizado');
    expect((await c.adm.solicitar(c.base)).terceirizado).toEqual({ notas: [] });
    await expect(c.adm.solicitar({ ...c.base, tipo: 'reembolso', favorecido: 'X', reembolsoDe: 'Y' })).rejects.toThrow('Pix ou boleto');
  });

  it('notas só entram depois do pagamento; somando o valor pago o acompanhamento fecha sozinho', async () => {
    const c = await cenario();
    const aberto = await c.adm.solicitar(c.base);
    await expect(c.adm.lancarNota(aberto.id, { numero: '10', valor: 1000 })).rejects.toThrow('depois que o pagamento é registrado');
    await c.adm.conferir(aberto.id);
    const p = await c.adm.pagar(aberto.id, { data: '2026-11-20', empresaId: c.aln.id, contaId: c.contaAln.id, valor: 5000 });
    expect(notasPendentes(p, '2026-11-26')).toBe(true);
    expect(resumoNotas(p, '2026-11-26')).toMatchObject({ pago: 5000, soma: 0, falta: 5000, dias: 6, pendente: true });

    const a = await c.pag.lancarNota(p.id, { numero: '10', valor: 3000, emissao: '2026-11-22', arquivo: { uri: 'file://nf10.xml', formato: 'xml', nome: 'nf10.xml' } });
    expect(resumoNotas(a, '2026-11-26')).toMatchObject({ soma: 3000, falta: 2000, pendente: true });
    expect((await c.pag.anexos(p.id)).map((x) => x.nome)).toEqual(['nf10.xml']);
    await expect(c.pag.lancarNota(p.id, { numero: '10', valor: 10 })).rejects.toThrow('já foi lançada');
    await expect(c.pag.lancarNota(p.id, { numero: '', valor: 10 })).rejects.toThrow('número da nota');
    await expect(c.pag.lancarNota(p.id, { numero: '11', valor: 0 })).rejects.toThrow('valor da nota');
    await expect(c.enc.lancarNota(p.id, { numero: '11', valor: 10 })).rejects.toThrow('Sem permissão');

    const b = await c.pag.lancarNota(p.id, { numero: '11', valor: 2000 });
    expect(b.terceirizado!.encerrada).toBeTruthy();
    expect(notasPendentes(b, '2026-11-26')).toBe(false);
    expect(b.historico.slice(-3).map((h) => h.acao)).toEqual(['lancou_nota', 'lancou_nota', 'encerrou_notas']);
    await expect(c.pag.lancarNota(p.id, { numero: '12', valor: 5 })).rejects.toThrow('já foram encerradas');
  });

  it('remover uma nota reabre o que fechou sozinho e apaga o arquivo dela', async () => {
    const c = await cenario();
    const p = await pago(c, 1000);
    const a = await c.adm.lancarNota(p.id, { numero: '1', valor: 1000, arquivo: { uri: 'file://nf.pdf', formato: 'pdf' } });
    expect(a.terceirizado!.encerrada).toBeTruthy();
    const r = await c.adm.removerNota(p.id, a.terceirizado!.notas[0].id);
    expect(r.terceirizado).toEqual({ notas: [] });
    expect(notasPendentes(r, '2026-11-26')).toBe(true);
    expect(await c.adm.anexos(p.id)).toEqual([]);
    await expect(c.adm.removerNota(p.id, 'nada')).rejects.toThrow('Nota não encontrada');
  });

  it('notas que não fecham o valor: encerrar exige explicar a diferença (retenções, por exemplo)', async () => {
    const c = await cenario();
    const p = await pago(c);
    await c.pag.lancarNota(p.id, { numero: '7', valor: 4800 });
    await expect(c.pag.encerrarNotas(p.id, '  ')).rejects.toThrow('Explique a diferença');
    const e = await c.pag.encerrarNotas(p.id, 'Retenção de INSS 11% já descontada na nota');
    expect(e.terceirizado!.encerrada?.justificativa).toMatch(/INSS/);
    expect(resumoNotas(e, '2026-11-26')).toMatchObject({ falta: 200, pendente: false, encerrada: true });
    await expect(c.pag.encerrarNotas(p.id, 'de novo')).rejects.toThrow('já foram encerradas');
  });

  it('não aceita a mesma nota do mesmo favorecido em outro pedido', async () => {
    const c = await cenario();
    const p1 = await pago(c, 5000);
    const outro = await c.adm.solicitar({ ...c.base, descricao: 'Pintura bloco C', valor: 5000, vencimento: '2026-12-01' }, { confirmarDuplicado: true });
    await c.adm.conferir(outro.id);
    const p2 = await c.adm.pagar(outro.id, { data: '2026-11-21', empresaId: c.aln.id, contaId: c.contaAln.id, valor: 5000 });
    await c.adm.lancarNota(p1.id, { numero: '55', valor: 2000 });
    await expect(c.adm.lancarNota(p2.id, { numero: '55', valor: 2000 })).rejects.toThrow('já foi lançada no pedido');
  });

  it('filtros de pagos: empresa, conta, quem pagou e período; sem filtro tudo passa, com filtro só os pagos', async () => {
    const c = await cenario();
    const p = await pago(c);
    const aberto = await c.adm.solicitar({ ...c.base, descricao: 'outro', valor: 99 }, { confirmarDuplicado: true });
    expect(quemPagou(p)?.nome).toBe(CLINTON_FIN.nome);
    expect(passaNoFiltro(aberto, {})).toBe(true);
    expect(passaNoFiltro(aberto, { empresaId: c.aln.id })).toBe(false);
    expect(passaNoFiltro(p, { empresaId: c.aln.id, contaId: c.contaAln.id, pagadorId: CLINTON_FIN.id })).toBe(true);
    expect(passaNoFiltro(p, { empresaId: c.passos.id })).toBe(false);
    expect(passaNoFiltro(p, { pagadorId: PAGADORA.id })).toBe(false);
    expect(passaNoFiltro(p, { de: '2026-11-20', ate: '2026-11-20' })).toBe(true);
    expect(passaNoFiltro(p, { de: '2026-11-21' })).toBe(false);
    expect(passaNoFiltro(p, { ate: '2026-11-19' })).toBe(false);
  });
});
