import { readFileSync } from 'fs';
import { join } from 'path';
import { Estoque } from '../dados/estoque';
import { Financeiro } from '../dados/financeiro';
import { lerBoletoDoPdf } from '../domain/pdf';
import { lerNotaXml } from '../domain/nota';
import type { Usuario } from '../domain/tipos';
import { criarArmazenamentoMemoria } from '../storage/memoria';
import { RemotoFalso } from '../sync/remoto-falso';
import { Sincronizador } from '../sync/sincronizador';
import { CLINTON_FIN, ENCARREGADO, MARILIA, PAGADORA } from './fabricas';

/**
 * Teste geral: quatro aparelhos (administrador, almoxarife, solicitante e pagadora) trabalham sobre o mesmo servidor
 * e percorrem tudo o que o app faz: material x EPI, pedidos de pagamento, leitura de boleto/PDF/NF, fatura semanal.
 */
let tempo = 0;
let seq = 0;
function aparelho(usuario: Usuario, remoto: RemotoFalso) {
  const armazenamento = criarArmazenamentoMemoria();
  const o = { agora: () => new Date(Date.UTC(2026, 10, 24, 12, 0, tempo++)).toISOString(), novoId: () => `${usuario.id}-${++seq}` };
  return { estoque: new Estoque(armazenamento, usuario, o), fin: new Financeiro(armazenamento, usuario, o), sync: new Sincronizador(armazenamento, remoto), armazenamento };
}
const arq = (n: string) => new Uint8Array(readFileSync(join(__dirname, '../domain/fixtures', n)));
const FOTO = { uri: 'file:///nota.jpg', formato: 'imagem' as const, nome: 'nota.jpg' };

describe('teste geral do sistema', () => {
  it('percorre material, EPI, pedidos, leitura de documentos e fatura semanal entre quatro aparelhos', async () => {
    const remoto = new RemotoFalso();
    const adm = aparelho(CLINTON_FIN, remoto);
    const alm = aparelho(MARILIA, remoto);
    const caio = aparelho(ENCARREGADO, remoto);
    const joana = aparelho(PAGADORA, remoto);
    const sincronizar = async () => { for (const a of [adm, alm, caio, joana, adm, alm, caio, joana]) await a.sync.sincronizar(); };

    // 1. Cadastros do financeiro (administrador) e do galpão (almoxarife)
    await adm.fin.criarCadastrosIniciais();
    const rmg = await adm.fin.salvarCentro({ nome: 'RMG Água', ativo: true });
    const sms = await adm.fin.salvarCentro({ nome: 'SMS', ativo: true });
    const aco = await adm.fin.salvarFornecedor({ nome: 'Aço Potiguar', documento: '05948553000275', chavePix: '05948553000275', forma: 'pix', ativo: true });
    const loja = await adm.fin.salvarFornecedor({ nome: 'Casa do Construtor', forma: 'fatura', diaFechamento: 'sexta', ativo: true });
    const material = await alm.estoque.salvarItem({ nome: 'Tinta branca', unidade: 'lata', estoqueMinimo: 2, ativo: true });
    const bota = await alm.estoque.salvarItem({ nome: 'Bota de segurança', unidade: 'par', estoqueMinimo: 0, ativo: true, categoria: 'EPI', vidaUtilDias: 180 });
    const frente = await alm.estoque.salvarLocal({ nome: 'Riachuelo', centroCusto: 'RMG Água', ativo: true });
    const joao = await alm.estoque.salvarFuncionario({ nome: 'João', ativo: true });
    const ze = await alm.estoque.salvarFuncionario({ nome: 'Zé', ativo: true, grupo: 'epi', funcao: 'Servente', tamanhos: { calcado: '41' } });
    await sincronizar();

    // 2. Material e EPI são mundos separados
    await alm.estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: material.id, quantidade: 10, custoUnitario: 80 }, { itemId: bota.id, quantidade: 5, custoUnitario: 90 }] });
    await alm.estoque.lancar({ tipo: 'saida', data: '2026-11-11', localId: frente.id, funcionarioId: joao.id, linhas: [{ itemId: material.id, quantidade: 3 }] });
    await alm.estoque.lancar({ tipo: 'epi', data: '2026-11-12', funcionarioId: ze.id, linhas: [{ itemId: bota.id, quantidade: 1, ca: '42291', tamanho: '41', validade: '2027-05-10' }] });
    await expect(alm.estoque.lancar({ tipo: 'saida', data: '2026-11-12', localId: frente.id, funcionarioId: ze.id, linhas: [{ itemId: material.id, quantidade: 1 }] })).rejects.toThrow('Zé é funcionário de EPI');
    await expect(alm.estoque.lancar({ tipo: 'saida', data: '2026-11-12', localId: frente.id, funcionarioId: joao.id, linhas: [{ itemId: bota.id, quantidade: 1 }] })).rejects.toThrow('BOTA');
    expect((await alm.estoque.itens(false, 'material')).map((i) => i.nome)).toEqual(['TINTA BRANCA']);
    expect((await alm.estoque.itens(false, 'epi')).map((i) => i.nome)).toEqual(['BOTA DE SEGURANÇA']);
    expect((await alm.estoque.funcionarios(false, 'galpao')).map((f) => f.nome)).toEqual(['João']);
    expect((await alm.estoque.funcionarios(false, 'epi')).map((f) => f.nome)).toEqual(['Zé']);
    expect((await alm.estoque.posicao()).itens[material.id].quantidade).toBe(7);
    expect((await alm.estoque.posicao()).itens[bota.id].quantidade).toBe(4);
    await sincronizar();
    expect((await caio.estoque.posicao()).itens[material.id].quantidade).toBe(7);

    // 3. Pedidos: pequeno (Pix), grande (aprovação do administrador), reembolso
    const base = { tipo: 'pix' as const, descricao: 'Vergalhão', valor: 120, centroId: rmg.id, fornecedorId: aco.id };
    const p1 = await caio.fin.pedidos.solicitar(base);
    const p2 = await caio.fin.pedidos.solicitar({ ...base, descricao: 'Aço CA-50', valor: 800 });
    const p3 = await caio.fin.pedidos.solicitar({ tipo: 'reembolso', descricao: 'Gasolina', valor: 200, centroId: sms.id, favorecido: 'Maria', chavePix: 'maria@x.com', reembolsoDe: 'Maria' });
    await expect(caio.fin.pedidos.solicitar(base)).rejects.toThrow('DUPLICADO');
    await sincronizar();
    expect((await caio.fin.pedidos.lista()).map((p) => p.id).sort()).toEqual([p1.id, p2.id, p3.id].sort());
    expect(await joana.fin.pedidos.lista()).toHaveLength(3);

    const aln = (await joana.fin.empresas()).find((e) => e.apelido === 'ALN')!;
    const conta = (await joana.fin.contas()).find((c) => c.empresaId === aln.id)!;
    const pagar = (id: string, valor: number) => joana.fin.pedidos.pagar(id, { data: '2026-11-24', empresaId: aln.id, contaId: conta.id, valor });
    expect((await joana.fin.pedidos.conferir(p1.id)).status).toBe('pronto');
    expect((await joana.fin.pedidos.conferir(p2.id)).status).toBe('aprovacao');
    expect((await joana.fin.pedidos.conferir(p3.id)).status).toBe('aprovacao');
    await expect(joana.fin.pedidos.aprovar(p2.id)).rejects.toThrow('Só um administrador aprova');
    await expect(pagar(p2.id, 800)).rejects.toThrow('pronto para pagar');
    expect((await pagar(p1.id, 120)).status).toBe('pago');
    await sincronizar();
    expect((await adm.fin.pedidos.aprovar(p2.id)).status).toBe('pronto');
    expect((await adm.fin.pedidos.rejeitar(p3.id, 'Sem nota')).status).toBe('rejeitado');
    await sincronizar();
    await expect(pagar(p2.id, 800.5)).rejects.toThrow('explique');
    expect((await joana.fin.pedidos.pagar(p2.id, { data: '2026-11-24', empresaId: aln.id, contaId: conta.id, valor: 805, observacao: 'Frete' })).status).toBe('pago');

    // 4. Leitura de documentos: boleto digitado, boleto do PDF, NFS-e e NF-e
    const pdf = lerBoletoDoPdf(arq('boleto-chromium.pdf'), '2026-11-24')!;
    expect(pdf).toMatchObject({ banco: '237', valor: 999 });
    const p4 = await caio.fin.pedidos.solicitar({ tipo: 'boleto', descricao: 'Material elétrico', valor: 999, centroId: sms.id, fornecedorId: aco.id, boleto: pdf.linha, vencimento: '2026-12-01' });
    expect(p4.boleto).toBe(pdf.codigoBarras);
    await expect(caio.fin.pedidos.solicitar({ tipo: 'boleto', descricao: 'Outro', valor: 100, centroId: sms.id, fornecedorId: aco.id, boleto: pdf.linha, vencimento: '2026-12-01' })).rejects.toThrow('diferente do valor do boleto');
    expect(lerNotaXml('<CompNfse><Nfse><InfNfse><Numero>9</Numero><ValorLiquidoNfse>10.00</ValorLiquidoNfse><PrestadorServico><IdentificacaoPrestador><CpfCnpj><Cnpj>05948553000275</Cnpj></CpfCnpj></IdentificacaoPrestador><RazaoSocial>X</RazaoSocial></PrestadorServico></InfNfse></Nfse></CompNfse>')).toMatchObject({ tipo: 'nfse', valor: 10 });
    await caio.fin.pedidos.anexarArquivo(p4.id, { uri: 'file:///b.pdf', formato: 'pdf', nome: 'boleto.pdf' });

    // 5. Fatura semanal: compras avulsas com comprovante, fechamento em um pedido, devolução e novo fechamento
    const c1 = await caio.fin.compras.lancar({ fornecedorId: loja.id, descricao: 'Cimento', valor: 900, centroId: rmg.id }, FOTO);
    const c2 = await alm.fin.compras.lancar({ fornecedorId: loja.id, descricao: 'Areia', valor: 334.56, centroId: sms.id }, FOTO);
    await expect(alm.fin.compras.lancar({ fornecedorId: loja.id, descricao: 'Sem nota', valor: 10, centroId: sms.id }, undefined)).rejects.toThrow('Anexe a nota');
    await sincronizar();
    expect(remoto.arquivosEnviados.length).toBeGreaterThanOrEqual(3);
    expect((await joana.fin.compras.emAberto())[0].total).toBe(1234.56);
    const fatura = { tipo: 'boleto' as const, descricao: 'Fatura Casa do Construtor', valor: 1234.56, centroId: rmg.id, fornecedorId: loja.id, boleto: '00190.12343 56789.012343 56789.012343 1 16560000123456', fatura: { compras: [c1.id, c2.id] } };
    const pf = await joana.fin.pedidos.solicitar(fatura);
    expect(pf).toMatchObject({ aprovador: 'admin', centroId: rmg.id });
    await sincronizar();
    expect((await adm.fin.pedidos.cancelar(pf.id, 'Boleto errado')).status).toBe('cancelado');
    await sincronizar();
    expect((await joana.fin.compras.emAberto())[0].compras).toHaveLength(2);
    const pf2 = await joana.fin.pedidos.solicitar({ ...fatura, valor: 1300, fatura: { compras: [c1.id, c2.id], justificativa: 'Frete' }, boleto: undefined, tipo: 'pix', chavePix: '05948553000275' });
    await sincronizar();
    await adm.fin.pedidos.conferir(pf2.id);
    await sincronizar();
    expect((await adm.fin.pedidos.obter(pf2.id))?.status).toBe('pronto');
    expect((await pagar(pf2.id, 1300)).status).toBe('pago');
    await sincronizar();
    expect((await caio.fin.compras.lista()).every((c) => c.status === 'em_fatura' && c.pedidoId === pf2.id)).toBe(true);
    await expect(caio.fin.compras.cancelar(c1.id)).rejects.toThrow('já está numa fatura');

    // 6. Todos os aparelhos terminam iguais
    await sincronizar();
    for (const a of [adm, joana]) {
      const status = (await a.fin.pedidos.lista()).map((p) => `${p.codigo}:${p.status}`).sort();
      expect(status).toEqual((await adm.fin.pedidos.lista()).map((p) => `${p.codigo}:${p.status}`).sort());
    }
    expect((await adm.fin.pedidos.lista()).filter((p) => p.status === 'pago')).toHaveLength(3);
    expect(await adm.armazenamento.fila.listar()).toEqual([]);
  });
});
