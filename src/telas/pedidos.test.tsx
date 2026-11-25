import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { financeiroDeTeste, ARTHUR_FIN, CLINTON_FIN, ENCARREGADO, PAGADORA } from '../testes/fabricas';
import { Raiz } from './Raiz';

const saida = { pdf: jest.fn(async () => {}), xlsx: jest.fn(async () => {}) };
const fotos = { tirarFoto: async () => undefined, escolherDaGaleria: async () => undefined };
const base = { servicoFotos: fotos, saida, hoje: '2026-11-24', agora: () => '2026-11-24T18:00:00.000Z', carregarSaldos: async () => [] };

async function cadastros() {
  const t = financeiroDeTeste(CLINTON_FIN);
  await t.financeiro.criarCadastrosIniciais();
  const centro = await t.financeiro.salvarCentro({ nome: 'RMG Água', apelidos: [], ativo: true });
  const forn = await t.financeiro.salvarFornecedor({ nome: 'Aço Potiguar', forma: 'pix', chavePix: '05948553000275', ativo: true });
  return { ...t, centro, forn };
}

describe('Pedidos de pagamento na tela', () => {
  it('solicitante abre um pedido Pix; pagador confere e paga', async () => {
    const c = await cadastros();
    const sol = financeiroDeTeste(ENCARREGADO, c.armazenamento).financeiro;
    const r1 = await render(<Raiz {...base} usuario={ENCARREGADO} financeiro={sol} />);
    await fireEvent.press(await screen.findByTestId('novo-pedido'));
    await fireEvent.press(await screen.findByTestId('pedido-fornecedor'));
    await fireEvent.press(await screen.findByTestId(`pedido-fornecedor-opcao-${c.forn.id}`));
    await fireEvent.changeText(screen.getByTestId('pedido-descricao'), 'Vergalhão');
    await fireEvent.changeText(screen.getByTestId('pedido-valor'), '120,50');
    await fireEvent.press(screen.getByTestId('enviar-pedido'));
    expect(await screen.findByText('Escolha o centro de custo')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pedido-centro'));
    await fireEvent.press(await screen.findByTestId(`pedido-centro-opcao-${c.centro.id}`));
    await fireEvent.press(screen.getByTestId('enviar-pedido'));
    expect(await screen.findByText(/Pedido P-\d{4}-\w{3} enviado\./)).toBeTruthy();
    expect(screen.getByText('Aguardando conferência')).toBeTruthy();
    await r1.unmount();

    const pag = financeiroDeTeste(PAGADORA, c.armazenamento).financeiro;
    await render(<Raiz {...base} usuario={PAGADORA} financeiro={pag} />);
    const [p] = await pag.pedidos.lista();
    await fireEvent.press(await screen.findByTestId(`pedido-${p.id}`));
    await fireEvent.press(await screen.findByTestId('conferir'));
    await waitFor(async () => expect((await pag.pedidos.obter(p.id))?.status).toBe('pronto'));
    await fireEvent.press(await screen.findByTestId('pedidos-pagar'));
    await fireEvent.press(await screen.findByTestId(`pedido-${p.id}`));
    await fireEvent.press(await screen.findByTestId('pagar'));
    await fireEvent.press(await screen.findByTestId('pag-empresa'));
    const emp = (await pag.empresas())[0];
    await fireEvent.press(await screen.findByTestId(`pag-empresa-opcao-${emp.id}`));
    await fireEvent.press(await screen.findByTestId('pag-conta'));
    const conta = (await pag.contas()).find((x) => x.empresaId === emp.id)!;
    await fireEvent.press(await screen.findByTestId(`pag-conta-opcao-${conta.id}`));
    await fireEvent.press(screen.getByTestId('confirmar-pagamento'));
    expect(await screen.findByText(new RegExp(`Pedido ${p.codigo} pago\\.`))).toBeTruthy();
    expect((await pag.pedidos.obter(p.id))?.status).toBe('pago');
  });

  it('boleto: a linha digitável preenche valor e vencimento; código inválido mostra o erro', async () => {
    const c = await cadastros();
    const sol = financeiroDeTeste(ENCARREGADO, c.armazenamento).financeiro;
    await render(<Raiz {...base} usuario={ENCARREGADO} financeiro={sol} />);
    await fireEvent.press(await screen.findByTestId('novo-pedido'));
    await fireEvent.press(await screen.findByTestId('tipo-pedido-boleto'));
    await fireEvent.changeText(screen.getByTestId('pedido-boleto'), '12345');
    expect(await screen.findByTestId('boleto-erro')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('pedido-boleto'), '00190.12343 56789.012343 56789.012343 1 16560000123456');
    expect(await screen.findByText(/Boleto lido: R\$ 1\.234,56, vence 10\/12\/2026/)).toBeTruthy();
    expect(screen.getByTestId('pedido-valor').props.value).toBe('1234,56');
  });

  it('XML da NF-e anexado preenche fornecedor, valor, vencimento e nota', async () => {
    const c = await cadastros();
    await c.financeiro.salvarFornecedor({ id: c.forn.id, nome: 'Aço Potiguar', forma: 'pix', chavePix: '05948553000275', documento: '05948553000275', ativo: true });
    const chave = '24261112345678000190550010000012341000012343';
    const xml = `<nfeProc><NFe><infNFe Id="NFe${chave}"><ide><serie>1</serie><nNF>1234</nNF><dhEmi>2026-11-20T09:30:00-03:00</dhEmi></ide>`
      + '<emit><CNPJ>05948553000275</CNPJ><xNome>Aço Potiguar</xNome></emit><total><ICMSTot><vNF>980.00</vNF></ICMSTot></total>'
      + '<cobr><dup><nDup>001</nDup><dVenc>2026-12-05</dVenc><vDup>980.00</vDup></dup></cobr></infNFe></NFe></nfeProc>';
    const sol = financeiroDeTeste(ENCARREGADO, c.armazenamento).financeiro;
    const comXml = { ...fotos, escolherDocumento: async () => ({ uri: 'file:///nota.xml', nome: 'nota.xml', formato: 'xml' as const, texto: xml }) };
    await render(<Raiz {...base} servicoFotos={comXml} usuario={ENCARREGADO} financeiro={sol} />);
    await fireEvent.press(await screen.findByTestId('novo-pedido'));
    await fireEvent.press(await screen.findByTestId('anexar-documento'));
    expect(await screen.findByTestId('info-nota')).toBeTruthy();
    expect(screen.getByTestId('pedido-valor').props.value).toBe('980');
    expect(screen.getByTestId('pedido-vencimento').props.value).toBe('05/12/2026');
    expect(screen.getByTestId('pedido-descricao').props.value).toBe('NF 1234 — Aço Potiguar');
    await fireEvent.press(screen.getByTestId('pedido-centro'));
    await fireEvent.press(await screen.findByTestId(`pedido-centro-opcao-${c.centro.id}`));
    await fireEvent.press(screen.getByTestId('enviar-pedido'));
    await screen.findByText(/enviado\./);
    const [p] = await sol.pedidos.lista();
    expect(p).toMatchObject({ valor: 980, fornecedorId: c.forn.id, vencimento: '2026-12-05', nota: { numero: '1234', chave } });
    expect(await sol.pedidos.anexos(p.id)).toHaveLength(1);
  });
  it('administrador que não paga (Arthur, Daniel) confere e aprova, mas não vê o botão de pagar', async () => {
    const c = await cadastros();
    const sol = financeiroDeTeste(ENCARREGADO, c.armazenamento).financeiro;
    const p = await sol.pedidos.solicitar({ tipo: 'pix', descricao: 'Aço', valor: 900, centroId: c.centro.id, fornecedorId: c.forn.id });
    const arthur = financeiroDeTeste(ARTHUR_FIN, c.armazenamento).financeiro;
    await render(<Raiz {...base} usuario={ARTHUR_FIN} financeiro={arthur} />);
    expect(screen.getByTestId('pilar-financeiro')).toBeTruthy();
    expect(screen.queryByTestId('pilar-estoque')).toBeNull();
    await fireEvent.press(await screen.findByTestId(`pedido-${p.id}`));
    await fireEvent.press(await screen.findByTestId('conferir'));
    await waitFor(async () => expect((await arthur.pedidos.obter(p.id))?.status).toBe('pronto'));
    await fireEvent.press(await screen.findByTestId('pedidos-pagar'));
    await fireEvent.press(await screen.findByTestId(`pedido-${p.id}`));
    expect(await screen.findByTestId('status-pedido')).toBeTruthy();
    expect(screen.queryByTestId('pagar')).toBeNull();
  });
});
