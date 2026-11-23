import { writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { estoqueComCadastros } from '../testes/fabricas';
import { relatorioEpi, relatorioFerramentasFora, relatorioGastos, relatorioHistorico, relatorioHtml, relatorioSaldo } from './relatorios';
import { relatorioXlsx } from './xlsx';

async function cenario() {
  const c = await estoqueComCadastros();
  const { estoque, tinta, riachuelo, macaiba, joao } = c;
  await estoque.lancar({ tipo: 'entrada', data: '2026-11-01', notaFiscal: '10', fornecedor: 'Iquine', linhas: [{ itemId: tinta.id, quantidade: 20, custoUnitario: 50 }] });
  await estoque.lancar({ tipo: 'entrada', data: '2026-11-02', linhas: [{ itemId: tinta.id, quantidade: 10, custoUnitario: 52 }] });
  await estoque.lancar({ tipo: 'saida', data: '2026-11-03', localId: riachuelo.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 25 }] });
  await estoque.lancar({ tipo: 'devolucao', data: '2026-11-04', localId: riachuelo.id, linhas: [{ itemId: tinta.id, quantidade: 1 }] });
  await estoque.lancar({ tipo: 'transferencia', data: '2026-11-05', localId: riachuelo.id, localDestinoId: macaiba.id, linhas: [{ itemId: tinta.id, quantidade: 4 }] });
  await estoque.salvarLocal({ nome: 'UBS', centroCusto: 'Contrato UBS', ativo: true });
  return { ...c, movs: await estoque.movimentos(), itens: await estoque.itens(), locais: await estoque.locais(), posicao: await estoque.posicao() };
}

describe('relatórios', () => {
  it('saldo com custo médio, valor e alerta de mínimo', async () => {
    const c = await cenario();
    const r = relatorioSaldo(c.itens, c.posicao, '2026-11-11');
    const tinta = r.linhas.find((l) => l.celulas[0] === 'TINTA BRANCA 18L')!;
    // saldo 6: 5 a R$ 52 + 1 devolvida a R$ 50,32 (média do que estava na frente: 20x50 + 5x52 = 1260 / 25)
    expect(tinta.celulas.slice(2, 6)).toEqual([6, 2, Math.round((260 + 50.4) / 6 * 100) / 100, 310.4]);
    expect(tinta.celulas[6]).toBe('');
    expect(r.linhas[r.linhas.length - 1]).toEqual({ celulas: ['Total', '', '', '', '', 310.4, ''], estilo: 'total' });
  });

  it('gastos por centro de custo e frente, com totais', async () => {
    const c = await cenario();
    const r = relatorioGastos(c.movs, c.itens, c.locais, c.posicao, { inicio: '2026-11-01', fim: '2026-11-30' });
    expect(r.linhas.map((l) => l.celulas)).toEqual([
      ['Escritórios da RMG', '', '', '', ''],
      ['Macaíba', 'TINTA BRANCA 18L', 'lata', 4, 201.6],
      ['Riachuelo', 'TINTA BRANCA 18L', 'lata', 20, 1008],
      ['Total Escritórios da RMG', '', '', '', 1209.6],
      ['Total geral', '', '', '', 1209.6],
    ]);
  });

  it('histórico do item com saldo anterior e saldo após cada lançamento', async () => {
    const c = await cenario();
    const r = relatorioHistorico(c.tinta, c.movs, c.locais, [c.joao], c.posicao, { inicio: '2026-11-02', fim: '2026-11-04' });
    expect(r.linhas.map((l) => [l.celulas[1], l.celulas[3], l.celulas[6]])).toEqual([
      ['Saldo anterior', '', 20], ['Entrada', 10, 30], ['Saída', -25, 5], ['Devolução', 1, 6],
    ]);
    expect(r.linhas[2].celulas[2]).toBe('Riachuelo · retirou: João');
  });

  it('PDF (HTML) e Excel abrem com o conteúdo', async () => {
    const c = await cenario();
    const r = relatorioSaldo(c.itens, c.posicao, '2026-11-11');
    const html = relatorioHtml(r, '11/11/2026 15:00');
    expect(html).toContain('R$ 310,40');
    expect(html).toContain('<tr class="total">');
    const bytes = await relatorioXlsx(r);
    const zip = await JSZip.loadAsync(bytes);
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet).toContain('TINTA BRANCA 18L');
    expect(sheet).toContain('<v>310.4</v>');
    if (process.env.SALVAR_AMOSTRA) writeFileSync(process.env.SALVAR_AMOSTRA, bytes);
  });
});

describe('relatórios da etapa 2', () => {
  it('ferramentas fora do galpão, com atraso, ordenadas pela data prevista', async () => {
    const { estoque, joao, riachuelo } = await estoqueComCadastros();
    const maria = await estoque.salvarFuncionario({ nome: 'Maria', ativo: true });
    const f1 = await estoque.salvarFerramenta({ nome: 'Furadeira', codigo: '03', ativo: true });
    const f2 = await estoque.salvarFerramenta({ nome: 'Escada', ativo: true });
    const f3 = await estoque.salvarFerramenta({ nome: 'Serra', ativo: true });
    await estoque.emprestar({ ferramentaId: f1.id, funcionarioId: joao.id, localId: riachuelo.id, saida: '2026-11-02', prevista: '2026-11-09' });
    await estoque.emprestar({ ferramentaId: f2.id, funcionarioId: maria.id, saida: '2026-11-10', prevista: '2026-11-20' });
    const devolvida = await estoque.emprestar({ ferramentaId: f3.id, funcionarioId: maria.id, saida: '2026-11-01', prevista: '2026-11-05' });
    await estoque.devolverFerramenta(devolvida.id, { devolvidoEm: '2026-11-04' });
    const r = relatorioFerramentasFora(await estoque.ferramentas(), await estoque.emprestimos(), await estoque.funcionarios(), await estoque.locais(), '2026-11-11');
    expect(r.linhas.map((l) => l.celulas)).toEqual([
      ['FURADEIRA 03', 'João', 'Riachuelo', '02/11/2026', '09/11/2026', 'Atrasada 2 dias'],
      ['ESCADA', 'Maria', '', '10/11/2026', '20/11/2026', 'No prazo'],
    ]);
    expect(r.subtitulo).toContain('2 ferramentas');
  });

  it('ficha de EPI por funcionário, sem entregas canceladas, filtrável por funcionário', async () => {
    const { estoque, joao } = await estoqueComCadastros();
    const maria = await estoque.salvarFuncionario({ nome: 'Maria', ativo: true });
    const bota = await estoque.salvarItem({ nome: 'Bota', unidade: 'par', estoqueMinimo: 0, ativo: true });
    await estoque.lancar({ tipo: 'entrada', data: '2026-11-01', linhas: [{ itemId: bota.id, quantidade: 10, custoUnitario: 80 }] });
    await estoque.lancar({ tipo: 'epi', data: '2026-11-05', funcionarioId: maria.id, linhas: [{ itemId: bota.id, quantidade: 1, ca: '555', tamanho: '38', validade: '2027-05-05' }] });
    await estoque.lancar({ tipo: 'epi', data: '2026-11-06', funcionarioId: joao.id, linhas: [{ itemId: bota.id, quantidade: 1, tamanho: '42' }] });
    const [errada] = await estoque.lancar({ tipo: 'epi', data: '2026-11-07', funcionarioId: joao.id, linhas: [{ itemId: bota.id, quantidade: 1 }] });
    await estoque.cancelarMovimento(errada.id, 'engano');
    const movs = await estoque.movimentos();
    const itens = await estoque.itens();
    const funcs = await estoque.funcionarios();
    const p = { inicio: '2026-11-01', fim: '2026-11-30' };
    expect(relatorioEpi(movs, itens, funcs, p).linhas.map((l) => l.celulas)).toEqual([
      ['João', '', '', '', '', ''], ['06/11/2026', 'BOTA', 1, '', '42', ''],
      ['Maria', '', '', '', '', ''], ['05/11/2026', 'BOTA', 1, '555', '38', '05/05/2027'],
    ]);
    const so = relatorioEpi(movs, itens, funcs, p, maria.id);
    expect(so.linhas).toHaveLength(2);
    expect(so.subtitulo).toContain('Maria');
    const hist = relatorioHistorico(bota, movs, [], funcs, await estoque.posicao(), p);
    expect(hist.linhas[2].celulas.slice(1, 4)).toEqual(['Entrega de EPI', 'entregue a Maria · CA 555 · tam. 38', -1]);
  });
});
