import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Estoque } from '../dados/estoque';
import { ARTHUR, CLINTON, estoqueComCadastros, estoqueDeTeste, JOANA } from '../testes/fabricas';
import { Raiz } from './Raiz';

const fotos = { tirarFoto: async () => undefined, escolherDaGaleria: async () => undefined };
const saida = { pdf: jest.fn(async () => {}), xlsx: jest.fn(async () => {}) };
const base = { servicoFotos: fotos, saida, hoje: '2026-11-11', agora: () => '2026-11-11T18:00:00.000Z', carregarSaldos: async () => [] };

describe('Raiz', () => {
  it('consultor (Arthur, Daniel) vê todo o estoque, sem lançar nada', async () => {
    const c = await estoqueComCadastros();
    await c.estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: c.tinta.id, quantidade: 1, custoUnitario: 50 }] });
    const arthur = new Estoque(c.armazenamento, ARTHUR, { agora: () => '2026-11-11T12:00:00.000Z', novoId: () => 'x' });
    await render(<Raiz {...base} usuario={ARTHUR} estoque={arthur} />);
    expect(await screen.findByText('TINTA BRANCA 18L')).toBeTruthy();
    expect(screen.queryByTestId('aba-lancar')).toBeNull();
    await fireEvent.press(screen.getByTestId('aba-equipamentos'));
    expect(screen.queryByTestId('novo-bem')).toBeNull();
    await fireEvent.press(screen.getByTestId('aba-epi'));
    expect(screen.queryByTestId('epi-entregar')).toBeNull();
    expect(screen.getByTestId('epi-trocas')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('aba-mais'));
    expect(screen.getByTestId('aviso-leitura')).toBeTruthy();
    expect(screen.getByTestId('abrir-historico')).toBeTruthy();
    expect(screen.getByTestId('abrir-relatorios')).toBeTruthy();
    expect(screen.queryByTestId('abrir-cadastros')).toBeNull();
    expect(screen.queryByTestId('abrir-inventario')).toBeNull();
    await fireEvent.press(screen.getByTestId('abrir-historico'));
    await fireEvent.press((await screen.findAllByTestId(/^grupo-/))[0]);
    expect(screen.queryByTestId('editar-cabecalho')).toBeNull();
    expect(screen.queryAllByTestId(/^cancelar-/)).toHaveLength(0);
  });

  it('controle (Joana): EPI, ferramentas e cadastros de EPI; sem lançar material', async () => {
    const c = await estoqueComCadastros();
    const joana = new Estoque(c.armazenamento, JOANA, { agora: () => '2026-11-11T12:00:00.000Z', novoId: () => `j${Math.random()}` });
    await render(<Raiz {...base} usuario={JOANA} estoque={joana} />);
    expect(screen.queryByTestId('aba-lancar')).toBeNull();
    await fireEvent.press(screen.getByTestId('aba-equipamentos'));
    expect(await screen.findByTestId('novo-bem')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('aba-epi'));
    expect(screen.getByTestId('epi-entregar')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('aba-mais'));
    expect(screen.getByTestId('aviso-controle')).toBeTruthy();
    expect(screen.queryByTestId('abrir-inventario')).toBeNull();
    expect(screen.queryByTestId('abrir-importar')).toBeNull();
    await fireEvent.press(screen.getByTestId('abrir-cadastros'));
    expect(await screen.findByTestId('aba-itens-epi')).toBeTruthy();
    expect(screen.queryByTestId('aba-itens')).toBeNull();
    expect(screen.queryByTestId('aba-locais')).toBeNull();
  });

  it('quem não tem acesso a nenhum pilar vê o aviso para pedir liberação', async () => {
    await render(<Raiz {...base} usuario={{ id: 'u-novo', nome: 'Novo', papel: 'nenhum' }} />);
    expect(screen.getByTestId('sem-acesso')).toBeTruthy();
    expect(screen.queryByTestId('pilar-conta')).toBeNull();
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
    await waitFor(() => expect(screen.getByTestId('valor-total')).toHaveTextContent('Valor em estoque: R$ 88,00'));
    expect(screen.getByTestId('saldo-i-broxa')).toHaveTextContent('10');
    // filtros prontos: zerados (os outros 44) e pintura
    await fireEvent.press(screen.getByTestId('filtro-zerados'));
    expect(screen.queryByTestId('item-i-broxa')).toBeNull();
    await fireEvent.press(screen.getByTestId('filtro-com-saldo'));
    expect(screen.getByTestId('item-i-broxa')).toBeTruthy();
    expect(screen.getByTestId('filtro-cat:Elétrica')).toHaveTextContent('Elétrica (4)');
  });

  it('histórico: cancela uma linha com motivo e mostra quem cancelou', async () => {
    const { estoque, tinta, riachuelo, joao } = await estoqueComCadastros();
    await estoque.lancar({ tipo: 'entrada', data: '2026-11-01', linhas: [{ itemId: tinta.id, quantidade: 5, custoUnitario: 10 }] });
    const [s] = await estoque.lancar({ tipo: 'saida', data: '2026-11-02', localId: riachuelo.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 2 }] });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-mais'));
    await fireEvent.press(screen.getByTestId('abrir-historico'));
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
    await fireEvent.press(screen.getByTestId('aba-mais'));
    await fireEvent.press(screen.getByTestId('abrir-relatorios'));
    await fireEvent.press(screen.getByTestId('saldo-pdf'));
    await waitFor(() => expect(saida.pdf).toHaveBeenCalled());
    expect((saida.pdf.mock.calls[0] as unknown[])[0]).toContain('Saldo do estoque');
    await fireEvent.press(screen.getByTestId('gastos-xlsx'));
    await waitFor(() => expect(saida.xlsx).toHaveBeenCalled());
    await fireEvent.press(screen.getByTestId('historico-pdf'));
    expect(await screen.findByTestId('erro')).toHaveTextContent('Escolha o item');
  });
});
