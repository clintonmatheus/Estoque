import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ARTHUR, CLINTON, estoqueComCadastros, estoqueDeTeste } from '../testes/fabricas';
import { Raiz } from './Raiz';

const fotos = { tirarFoto: async () => undefined, escolherDaGaleria: async () => undefined };
const saida = { pdf: jest.fn(async () => {}), xlsx: jest.fn(async () => {}) };
const base = { servicoFotos: fotos, saida, hoje: '2026-11-11', agora: () => '2026-11-11T18:00:00.000Z', carregarSaldos: async () => [] };

describe('Raiz', () => {
  it('consultor vê só saldos, sem valores', async () => {
    const carregar = jest.fn(async () => [{ itemId: 't', nome: 'TINTA', unidade: 'lata', estoqueMinimo: 2, saldo: 1 }]);
    await render(<Raiz {...base} usuario={ARTHUR} carregarSaldos={carregar} />);
    expect(await screen.findByText('TINTA')).toBeTruthy();
    expect(screen.getByText('1 lata · mínimo 2')).toBeTruthy();
    expect(screen.queryByText(/R\$/)).toBeNull();
    expect(screen.queryByTestId('aba-lancar')).toBeNull();
  });

  it('administrador importa a planilha, faz a contagem inicial e vê o valor em estoque', async () => {
    const { estoque } = estoqueDeTeste(CLINTON);
    await render(<Raiz {...base} usuario={CLINTON} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-mais'));
    await fireEvent.press(screen.getByTestId('abrir-cadastros'));
    await fireEvent.press(await screen.findByTestId('importar'));
    expect(await screen.findByText('45 itens importados da planilha.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('voltar'));
    await fireEvent.press(screen.getByTestId('abrir-inventario'));
    await fireEvent.changeText(await screen.findByTestId('busca'), 'broxa');
    await fireEvent.changeText(await screen.findByTestId('contado-i-broxa'), '10');
    await fireEvent.press(screen.getByTestId('revisar-inventario'));
    expect(screen.getByTestId('diferenca-total')).toHaveTextContent('Diferença estimada: R$ 88,00');
    await fireEvent.press(screen.getByTestId('confirmar-inventario'));
    expect(await screen.findByText('Inventário registrado: 1 ajuste(s).')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('aba-estoque'));
    await waitFor(() => expect(screen.getByTestId('valor-total')).toHaveTextContent('R$ 88,00'));
    expect(screen.getByTestId('saldo-i-broxa')).toHaveTextContent('10 un');
  });

  it('histórico: cancela uma linha com motivo e mostra quem cancelou', async () => {
    const { estoque, tinta, riachuelo, joao } = await estoqueComCadastros();
    await estoque.lancar({ tipo: 'entrada', data: '2026-11-01', linhas: [{ itemId: tinta.id, quantidade: 5, custoUnitario: 10 }] });
    const [s] = await estoque.lancar({ tipo: 'saida', data: '2026-11-02', localId: riachuelo.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 2 }] });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-historico'));
    await fireEvent.press(await screen.findByTestId(`grupo-${s.grupo}`));
    expect(screen.getByText('Destino: Riachuelo')).toBeTruthy();
    expect(screen.getByText('Retirou: João')).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`cancelar-${s.id}`));
    await fireEvent.changeText(screen.getByTestId('motivo'), 'lançada em dobro');
    await fireEvent.press(screen.getByTestId('confirmar-cancelamento'));
    expect(await screen.findByText(/Cancelado por Marilia .* — lançada em dobro/)).toBeTruthy();
    expect((await estoque.posicao()).itens[tinta.id].quantidade).toBe(5);
  });

  it('relatórios geram PDF e Excel', async () => {
    const { estoque } = await estoqueComCadastros();
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-relatorios'));
    await fireEvent.press(screen.getByTestId('saldo-pdf'));
    await waitFor(() => expect(saida.pdf).toHaveBeenCalled());
    expect((saida.pdf.mock.calls[0] as unknown[])[0]).toContain('Saldo do estoque');
    await fireEvent.press(screen.getByTestId('gastos-xlsx'));
    await waitFor(() => expect(saida.xlsx).toHaveBeenCalled());
    await fireEvent.press(screen.getByTestId('historico-pdf'));
    expect(await screen.findByTestId('erro')).toHaveTextContent('Escolha o item');
  });
});
