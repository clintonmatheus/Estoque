import { CLINTON_FIN, ENCARREGADO, financeiroDeTeste, PAGADORA } from '../testes/fabricas';
import type { NovoPedido } from './pedidos';

const BOLETO = '00190.12343 56789.012343 56789.012343 1 16560000123456'; // R$ 1.234,56 · 10/12/2026

async function cenario() {
  const adm = financeiroDeTeste(CLINTON_FIN);
  await adm.financeiro.criarCadastrosIniciais();
  const rmg = await adm.financeiro.salvarCentro({ nome: 'RMG ÁGUA', ativo: true });
  const outro = await adm.financeiro.salvarCentro({ nome: 'SMS', ativo: true });
  const parado = await adm.financeiro.salvarCentro({ nome: 'CODERN', ativo: false });
  const frente = await adm.financeiro.salvarFrente({ nome: 'RMG PUREZA', centroId: rmg.id, ativo: true });
  const aco = await adm.financeiro.salvarFornecedor({ nome: 'Aço Potiguar', chavePix: '05948553000275', forma: 'pix', ativo: true });
  const material = (await adm.financeiro.tipos()).find((t) => t.nome === 'Material')!;
  const aln = (await adm.financeiro.empresas()).find((e) => e.apelido === 'ALN')!;
  const conta = (await adm.financeiro.contas()).find((c) => c.empresaId === aln.id)!;
  const por = (u: typeof ENCARREGADO) => financeiroDeTeste(u, adm.armazenamento).financeiro.pedidos;
  const base: NovoPedido = { tipo: 'pix', descricao: 'Cimento', valor: 120, centroId: rmg.id, fornecedorId: aco.id };
  return { adm: adm.financeiro.pedidos, pag: por(PAGADORA), enc: por(ENCARREGADO), rmg, outro, parado, frente, aco, material, aln, conta, base, armazenamento: adm.armazenamento };
}

describe('pedidos de pagamento', () => {
  it('pedido pequeno: solicitante envia, pagador confere (já fica pronto) e paga; tudo fica no histórico', async () => {
    const c = await cenario();
    const p = await c.enc.solicitar({ ...c.base, frenteId: c.frente.id, tipoDespesaId: c.material.id, urgente: true });
    expect(p).toMatchObject({ status: 'enviado', aprovador: 'nenhum', chavePix: '05948553000275', favorecido: 'Aço Potiguar', urgente: true });
    expect(p.codigo).toMatch(/^P-\d{4}-[A-Z0-9]{3}$/);
    const conferido = await c.pag.conferir(p.id);
    expect(conferido.status).toBe('pronto');
    const pago = await c.pag.pagar(p.id, { data: '2026-11-24', empresaId: c.aln.id, contaId: c.conta.id, valor: 120 });
    expect(pago.status).toBe('pago');
    expect(pago.historico.map((h) => `${h.acao}:${h.por.nome}`)).toEqual(['enviou:Encarregado', 'conferiu:Pagadora', 'pagou:Pagadora']);
  });

  it('acima de R$ 300 o pagador confere mas só o administrador aprova', async () => {
    const c = await cenario();
    const p = await c.enc.solicitar({ ...c.base, valor: 800 });
    expect(p.aprovador).toBe('admin');
    expect((await c.pag.conferir(p.id)).status).toBe('aprovacao');
    await expect(c.pag.aprovar(p.id)).rejects.toThrow('Só um administrador aprova');
    await expect(c.pag.pagar(p.id, { data: '2026-11-24', empresaId: c.aln.id, contaId: c.conta.id, valor: 800 })).rejects.toThrow('pronto para pagar');
    expect((await c.adm.aprovar(p.id, 'ok')).status).toBe('pronto');
  });

  it('reembolso: até R$ 150 o pagador aprova; acima, só administrador; exige quem gastou', async () => {
    const c = await cenario();
    const r = { ...c.base, tipo: 'reembolso' as const, chavePix: 'maria@x.com', fornecedorId: undefined, favorecido: 'Maria', reembolsoDe: 'Maria (servente)' };
    await expect(c.enc.solicitar({ ...r, reembolsoDe: '' })).rejects.toThrow('quem gastou');
    const pequeno = await c.enc.solicitar({ ...r, valor: 100 });
    expect(pequeno.aprovador).toBe('pagador');
    expect((await c.pag.conferir(pequeno.id)).status).toBe('pronto');
    const grande = await c.enc.solicitar({ ...r, valor: 200, descricao: 'Gasolina' });
    expect(grande.aprovador).toBe('admin');
    expect((await c.pag.conferir(grande.id)).status).toBe('aprovacao');
  });

  it('pedido aberto pelo pagador sempre vai a um administrador, e o pagador não o confere; administrador aprova o próprio', async () => {
    const c = await cenario();
    const p = await c.pag.solicitar({ ...c.base, valor: 50 });
    expect(p.aprovador).toBe('admin');
    await expect(c.pag.conferir(p.id)).rejects.toThrow('precisa ser conferido e aprovado por um administrador');
    expect((await c.adm.conferir(p.id)).status).toBe('pronto');
    const meu = await c.adm.solicitar({ ...c.base, valor: 5000, descricao: 'Adiantamento' });
    expect(meu.aprovador).toBe('admin');
    expect((await c.adm.conferir(meu.id)).status).toBe('pronto');
    expect((await c.adm.conferir(meu.id).catch((e: Error) => e.message))).toContain('aguardando conferência');
  });

  it('conferência corrige centro, frente e tipo; frente tem de ser do centro; centro parado não recebe pedido', async () => {
    const c = await cenario();
    await expect(c.enc.solicitar({ ...c.base, centroId: c.parado.id })).rejects.toThrow('CODERN está parado');
    await expect(c.enc.solicitar({ ...c.base, centroId: c.outro.id, frenteId: c.frente.id })).rejects.toThrow('não pertence');
    const p = await c.enc.solicitar({ ...c.base, frenteId: c.frente.id });
    const certo = await c.pag.conferir(p.id, { centroId: c.outro.id, tipoDespesaId: c.material.id });
    expect(certo).toMatchObject({ centroId: c.outro.id, tipoDespesaId: c.material.id, status: 'pronto' });
    expect(certo.frenteId).toBeUndefined(); // frente do centro antigo não vale no novo
  });

  it('devolver pede correção e o solicitante reenvia; só o dono edita; solicitante cancela até a conferência', async () => {
    const c = await cenario();
    const p = await c.enc.solicitar(c.base);
    await expect(c.pag.devolver(p.id, '')).rejects.toThrow('o que precisa ser corrigido');
    const dev = await c.pag.devolver(p.id, 'Falta a nota');
    expect(dev.status).toBe('devolvido');
    await expect(c.pag.solicitar({ ...c.base, id: p.id, valor: 130 })).rejects.toThrow('não dá para editar');
    const re = await c.enc.solicitar({ ...c.base, id: p.id, valor: 130 });
    expect(re).toMatchObject({ status: 'enviado', valor: 130, codigo: p.codigo });
    expect(re.historico.map((h) => h.acao)).toEqual(['enviou', 'devolveu', 'reenviou']);
    expect((await c.enc.cancelar(p.id)).status).toBe('cancelado');
    const q = await c.enc.solicitar({ ...c.base, descricao: 'Outro', valor: 77 });
    await c.pag.conferir(q.id);
    await expect(c.enc.cancelar(q.id)).rejects.toThrow('antes da conferência');
    await expect(c.pag.cancelar(q.id)).rejects.toThrow('motivo');
    expect((await c.pag.cancelar(q.id, 'Pedido em duplicidade')).status).toBe('cancelado');
  });

  it('só o administrador rejeita; pedido pago não se cancela nem se devolve', async () => {
    const c = await cenario();
    const p = await c.enc.solicitar(c.base);
    await expect(c.pag.rejeitar(p.id, 'não')).rejects.toThrow('só o administrador');
    await c.pag.conferir(p.id);
    await c.pag.pagar(p.id, { data: '2026-11-24', empresaId: c.aln.id, contaId: c.conta.id, valor: 120 });
    await expect(c.adm.rejeitar(p.id, 'tarde')).rejects.toThrow('não pode ser rejeitado');
    await expect(c.pag.cancelar(p.id, 'x')).rejects.toThrow('não pode mais ser cancelado');
    await expect(c.pag.devolver(p.id, 'x')).rejects.toThrow('não pode ser devolvido');
    const q = await c.enc.solicitar({ ...c.base, valor: 11 });
    expect((await c.adm.rejeitar(q.id, 'Não é da obra')).status).toBe('rejeitado');
  });

  it('pagamento: conta da empresa, valor diferente exige explicação, data não pode ser futura', async () => {
    const c = await cenario();
    const p = await c.enc.solicitar(c.base);
    await c.pag.conferir(p.id);
    const passos = (await c.adm.lista()).length && (await c.pag.anexos(p.id));
    expect(passos).toEqual([]);
    const outraConta = (await financeiroDeTeste(CLINTON_FIN, c.armazenamento).financeiro.contas()).find((x) => x.empresaId !== c.aln.id)!;
    await expect(c.pag.pagar(p.id, { data: '2026-11-24', empresaId: c.aln.id, contaId: outraConta.id, valor: 120 })).rejects.toThrow('conta dela');
    await expect(c.pag.pagar(p.id, { data: '2026-11-24', empresaId: c.aln.id, contaId: c.conta.id, valor: 125 })).rejects.toThrow('explique');
    await expect(c.pag.pagar(p.id, { data: '2026-12-30', empresaId: c.aln.id, contaId: c.conta.id, valor: 120 })).rejects.toThrow('futura');
    const pago = await c.pag.pagar(p.id, { data: '2026-11-24', empresaId: c.aln.id, contaId: c.conta.id, valor: 125, observacao: 'Juros de atraso' });
    expect(pago.pagamento).toMatchObject({ valor: 125, observacao: 'Juros de atraso' });
    await expect(c.enc.pagar(p.id, { data: '2026-11-24', empresaId: c.aln.id, contaId: c.conta.id, valor: 120 })).rejects.toThrow('só o pagador');
  });

  it('boleto: confere a linha digitável, usa o vencimento dela e recusa valor diferente', async () => {
    const c = await cenario();
    const b = { ...c.base, tipo: 'boleto' as const, boleto: BOLETO, valor: 1234.56 };
    await expect(c.enc.solicitar({ ...b, boleto: '' })).rejects.toThrow('linha digitável');
    await expect(c.enc.solicitar({ ...b, boleto: BOLETO.replace('123456', '123457') })).rejects.toThrow('Boleto inválido');
    await expect(c.enc.solicitar({ ...b, valor: 1000 })).rejects.toThrow('diferente do valor do boleto');
    const p = await c.enc.solicitar(b);
    expect(p).toMatchObject({ vencimento: '2026-12-10', boleto: '00191165600001234560123456789012345678901234', aprovador: 'admin' });
  });

  it('pix: valida a chave; pede quem recebe; fornecedor traz a chave', async () => {
    const c = await cenario();
    await expect(c.enc.solicitar({ ...c.base, fornecedorId: undefined, chavePix: '123', favorecido: 'Zé' })).rejects.toThrow('Chave Pix inválida');
    await expect(c.enc.solicitar({ ...c.base, fornecedorId: undefined, chavePix: 'ze@x.com' })).rejects.toThrow('quem vai receber');
    await expect(c.enc.solicitar({ ...c.base, valor: 0 })).rejects.toThrow('valor');
    await expect(c.enc.solicitar({ ...c.base, descricao: ' ' })).rejects.toThrow('Descreva');
  });

  it('duplicados: mesma nota ou boleto é recusado; parecido pede confirmação', async () => {
    const c = await cenario();
    const nota = { chave: '24261112345678000190550010000012341000012343', numero: '1234' };
    const p = await c.enc.solicitar({ ...c.base, nota });
    await expect(c.enc.solicitar({ ...c.base, descricao: 'de novo', nota })).rejects.toThrow(`já foi pedido (${p.codigo}`);
    await expect(c.enc.solicitar({ ...c.base, descricao: 'outra' })).rejects.toThrow('DUPLICADO');
    const confirmado = await c.enc.solicitar({ ...c.base, descricao: 'outra' }, { confirmarDuplicado: true });
    expect(confirmado.id).not.toBe(p.id);
    await c.enc.cancelar(p.id); await c.enc.cancelar(confirmado.id);
    await c.enc.solicitar({ ...c.base, descricao: 'depois do cancelamento' }); // cancelados não contam
  });

  it('visibilidade: solicitante só vê os seus; pagador e administrador veem todos; sem financeiro, nada', async () => {
    const c = await cenario();
    await c.enc.solicitar(c.base);
    await c.pag.solicitar({ ...c.base, descricao: 'da pagadora', valor: 33 });
    expect((await c.enc.lista()).map((p) => p.descricao)).toEqual(['Cimento']);
    expect((await c.pag.lista()).length).toBe(2);
    expect((await c.adm.lista()).length).toBe(2);
    const sem = financeiroDeTeste({ id: 'x', nome: 'X', papel: 'almoxarife' }, c.armazenamento).financeiro.pedidos;
    await expect(sem.lista()).rejects.toThrow('não usa o financeiro');
  });

  it('arquivos: dono anexa antes da conferência; pagador anexa o comprovante; outro solicitante não', async () => {
    const c = await cenario();
    const p = await c.enc.solicitar(c.base);
    const nf = await c.enc.anexarArquivo(p.id, { uri: 'file://nf.xml', formato: 'xml', nome: 'nf.xml' });
    expect(nf).toMatchObject({ grupo: p.id, formato: 'xml', nome: 'nf.xml' });
    await c.pag.conferir(p.id);
    await expect(c.enc.anexarArquivo(p.id, { uri: 'file://x.pdf', formato: 'pdf' })).rejects.toThrow('Sem permissão');
    await c.pag.anexarArquivo(p.id, { uri: 'file://comprovante.pdf', formato: 'pdf', nome: 'comprovante.pdf' });
    expect((await c.pag.anexos(p.id)).map((a) => a.nome)).toEqual(['nf.xml', 'comprovante.pdf']);
    await c.pag.removerAnexo(nf.id);
    expect((await c.pag.anexos(p.id)).map((a) => a.nome)).toEqual(['comprovante.pdf']);
  });
});
