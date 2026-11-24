const { chromium } = require('playwright');
const OUT = process.argv[2];
const URL = 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERRO', e.message));
  const id = (t) => p.locator(`[data-testid="${t}"]`).first();
  const toque = async (t) => { await id(t).click(); await p.waitForTimeout(350); };
  const opcao = async (prefixo, texto) => { await p.locator(`[data-testid^="${prefixo}-opcao-"]`).filter({ hasText: texto }).first().click(); await p.waitForTimeout(350); };
  const escrever = async (t, v) => { await id(t).fill(v); await p.waitForTimeout(150); };
  const foto = async (nome) => { await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${nome}.png` }); console.log('ok', nome); };
  const rolarAte = async (t) => { await id(t).scrollIntoViewIfNeeded(); await p.waitForTimeout(300); };
  const inicio = async (q = '') => { await p.goto(URL + q); await p.waitForSelector('[data-testid="aba-mais"], [data-testid="sair"], input', { timeout: 30000 }); await p.waitForTimeout(800); };

  // Login
  await inicio('?perfil=login'); await foto('01_login');
  // Estoque
  await inicio(); await foto('02_estoque');
  await toque('resumo-minimo'); await foto('03_estoque_minimo');
  await toque('resumo-minimo');
  await p.locator('[data-testid^="item-"]').filter({ hasText: 'CABO PRA ROLO' }).first().click(); await foto('04_estoque_detalhe');
  // Lançar saída
  await toque('aba-lancar'); await toque('tipo-saida');
  await toque('local'); await opcao('local', 'Riachuelo');
  await toque('funcionario'); await opcao('funcionario', 'João');
  await toque('adicionar-item'); await opcao('item', 'DELANIL BRANCO GELO');
  await p.locator('[data-testid^="qtd-"]').first().fill('2');
  await foto('05_saida');
  await rolarAte('salvar'); await foto('06_saida_fim');
  // Entrada
  await toque('tipo-entrada');
  await escrever('nota', '4610'); await escrever('fornecedor', 'Iquine Distribuidora');
  await toque('adicionar-item'); await opcao('item', 'DIATEX IQUINE BRANCO NEVE');
  await p.locator('[data-testid^="qtd-"]').first().fill('10');
  await foto('07_entrada');
  // Equipamentos
  await toque('aba-equipamentos'); await foto('08_equipamentos');
  await p.locator('[data-testid^="bem-"]').filter({ hasText: 'ESCORA' }).first().click(); await foto('09_equip_detalhe');
  await rolarAte('registrar-mov');
  await escrever('mov-qtd', '20');
  await toque('mov-origem'); await opcao('mov-origem', 'Galpão');
  await toque('mov-pessoa'); await opcao('mov-pessoa', 'Carlos');
  await toque('mov-obra'); await opcao('mov-obra', 'UBS');
  await rolarAte('registrar-mov'); await foto('10_equip_movimentar');
  await p.locator('text=Lançado por').last().scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await foto('11_equip_historico');
  await toque('voltar-equip'); await toque('equip-alertas'); await foto('12_equip_alertas');
  await toque('equip-todos');
  await toque('novo-bem'); await toque('bem-tipo-locado'); await escrever('bem-nome', 'Sapata ajustável'); await escrever('loc-locadora', 'Agaé Locação');
  await escrever('loc-contrato', '1234'); await escrever('loc-valor', '1,80'); await escrever('loc-inicio', '24/11/2026'); await escrever('loc-fim', '24/02/2027');
  await foto('13_cadastro_locado');
  await rolarAte('bem-salvar'); await escrever('bem-qtd', '40'); await foto('14_cadastro_posse');
  // EPI
  await toque('aba-epi');
  await toque('funcionario'); await opcao('funcionario', 'Pedro');
  await toque('adicionar-item'); await opcao('item', 'BOTA');
  await p.locator('[data-testid^="qtd-"]').first().fill('1');
  await p.locator('[data-testid^="ca-"]').first().fill('42291');
  await p.locator('[data-testid^="tamanho-"]').first().fill('42');
  await p.locator('[data-testid^="validade-"]').first().fill('24/05/2027');
  await foto('15_epi_entregar');
  await toque('epi-trocas'); await foto('16_epi_trocas');
  await toque('epi-fichas'); await toque('epi-funcionario'); await opcao('epi-funcionario', 'João'); await foto('17_epi_ficha');
  // Mais
  await toque('aba-mais'); await foto('18_mais');
  await toque('abrir-historico'); await foto('19_historico');
  await p.locator('[data-testid^="grupo-"]').filter({ hasText: 'Saída · 10/11' }).first().click(); await foto('20_historico_detalhe');
  await toque('aba-mais'); await toque('abrir-relatorios'); await foto('21_relatorios');
  await p.mouse.wheel(0, 900); await p.locator('text=Ferramentas e equipamentos').last().scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await foto('22_relatorios_2');
  await toque('aba-mais'); await toque('abrir-cadastros'); await foto('23_cadastros');
  await toque('aba-mais'); await toque('abrir-inventario'); await foto('24_inventario');
  await toque('aba-mais'); await toque('abrir-importar'); await foto('25_importar');
  // Consultor
  await inicio('?perfil=consultor'); await foto('26_consultor');
  await b.close();
})();
