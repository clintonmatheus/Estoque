import { writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { estoqueComCadastros } from '../testes/fabricas';
import { relatorioGastos, relatorioHistorico, relatorioHtml, relatorioSaldo } from './relatorios';
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
