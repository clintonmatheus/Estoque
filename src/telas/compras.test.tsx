import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CLINTON_FIN, ENCARREGADO, estoqueComCadastros, financeiroDeTeste, MARILIA, PAGADORA } from '../testes/fabricas';
import { Raiz } from './Raiz';

const saida = { pdf: jest.fn(async () => {}), xlsx: jest.fn(async () => {}) };
const fotos = { tirarFoto: async () => 'file:///nota.jpg', escolherDaGaleria: async () => undefined };
const base = { servicoFotos: fotos, saida, hoje: '2026-11-24', agora: () => '2026-11-24T18:00:00.000Z', carregarSaldos: async () => [] };

async function cadastros() {
  const t = financeiroDeTeste(CLINTON_FIN);
  await t.financeiro.criarCadastrosIniciais();
  const centro = await t.financeiro.salvarCentro({ nome: 'RMG Água', apelidos: [], ativo: true });
  const loja = await t.financeiro.salvarFornecedor({ nome: 'Casa do Construtor', forma: 'fatura', diaFechamento: 'sexta', ativo: true });
  return { ...t, centro, loja };
}

describe('Compras a faturar na tela', () => {
  it('solicitante lança compra com foto da nota; sem comprovante é recusada; pagador fecha a fatura em um pedido', async () => {
    const c = await cadastros();
    const sol = financeiroDeTeste(ENCARREGADO, c.armazenamento).financeiro;
    const r1 = await render(<Raiz {...base} usuario={ENCARREGADO} financeiro={sol} />);
    await fireEvent.press(await screen.findByTestId('tela-compras'));
    await fireEvent.press(await screen.findByTestId('nova-compra'));
    await fireEvent.press(screen.getByTestId('compra-loja'));
    await fireEvent.press(await screen.findByTestId(`compra-loja-opcao-${c.loja.id}`));
    await fireEvent.changeText(screen.getByTestId('compra-descricao'), 'Cimento 10 sacos');
    await fireEvent.changeText(screen.getByTestId('compra-valor'), '450');
    await fireEvent.press(screen.getByTestId('compra-centro'));
    await fireEvent.press(await screen.findByTestId(`compra-centro-opcao-${c.centro.id}`));
    await fireEvent.press(screen.getByTestId('salvar-compra'));
    expect(await screen.findByText(/Anexe a nota/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('compra-foto'));
    expect(await screen.findByTestId('comprovante-ok')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('salvar-compra'));
    expect(await screen.findByText('Compra lançada.')).toBeTruthy();
    expect(screen.getByTestId(`total-${c.loja.id}`)).toHaveTextContent('R$ 450,00');
    await r1.unmount();

    const pag = financeiroDeTeste(PAGADORA, c.armazenamento).financeiro;
    await render(<Raiz {...base} usuario={PAGADORA} financeiro={pag} />);
    await fireEvent.press(await screen.findByTestId('tela-compras'));
    await fireEvent.press(await screen.findByTestId(`fechar-${c.loja.id}`));
    expect(await screen.findByText('Soma das compras: R$ 450,00')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('fatura-valor'), '470');
    await fireEvent.changeText(screen.getByTestId('pedido-boleto'), '00190.12343 56789.012343 56789.012343 1 16560000123456');
    await fireEvent.press(screen.getByTestId('enviar-fatura'));
    expect(await screen.findByText(/explique a diferença|diferente do valor do boleto/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('fatura-valor'), '1234,56');
    await fireEvent.press(screen.getByTestId('enviar-fatura'));
    expect(await screen.findByText(/explique a diferença/)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('fatura-justificativa'), 'Outras compras sem lançamento');
    await fireEvent.press(screen.getByTestId('enviar-fatura'));
    expect(await screen.findByText(/Fatura enviada no pedido P-/)).toBeTruthy();
    const [p] = await pag.pedidos.lista();
    expect(p).toMatchObject({ tipo: 'boleto', valor: 1234.56, fatura: { soma: 450, justificativa: 'Outras compras sem lançamento' } });
  });

  it('almoxarife sem perfil no financeiro lança compra pelo menu Mais', async () => {
    const e = await estoqueComCadastros(MARILIA);
    const c = await cadastros();
    const fin = financeiroDeTeste(MARILIA, e.armazenamento);
    void c;
    await render(<Raiz {...base} usuario={MARILIA} estoque={e.estoque} financeiro={fin.financeiro} />);
    await fireEvent.press(screen.getByTestId('aba-mais'));
    expect(screen.queryByTestId('abrir-pedidos')).toBeNull();
    await fireEvent.press(screen.getByTestId('abrir-compras'));
    expect(await screen.findByTestId('nova-compra')).toBeTruthy();
  });

  it('boleto: "Ler do PDF" acha o código no PDF e preenche valor e vencimento; PDF sem código avisa', async () => {
    const c = await cadastros();
    const sol = financeiroDeTeste(ENCARREGADO, c.armazenamento).financeiro;
    const bytes = new Uint8Array(readFileSync(join(__dirname, '../domain/fixtures/boleto-chromium.pdf')));
    const vazio = new Uint8Array(readFileSync(join(__dirname, '../domain/fixtures/boleto-simples.pdf')).subarray(0, 40));
    let escolha = { uri: 'file:///b.pdf', nome: 'boleto.pdf', formato: 'pdf' as const, bytes };
    const servicoFotos = { ...fotos, escolherDocumento: async () => escolha };
    await render(<Raiz {...base} servicoFotos={servicoFotos} usuario={ENCARREGADO} financeiro={sol} />);
    await fireEvent.press(await screen.findByTestId('novo-pedido'));
    await fireEvent.press(await screen.findByTestId('tipo-pedido-boleto'));
    escolha = { ...escolha, bytes: vazio };
    await fireEvent.press(screen.getByTestId('ler-pdf'));
    expect(await screen.findByText(/Não achei o código de barras no PDF/)).toBeTruthy();
    escolha = { ...escolha, bytes };
    await fireEvent.press(screen.getByTestId('ler-pdf'));
    expect(await screen.findByText(/Boleto lido: R\$ 999,00/)).toBeTruthy();
    expect(screen.getByTestId('pedido-valor').props.value).toBe('999');
  });
});
