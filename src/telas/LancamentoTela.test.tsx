import { fireEvent, render, screen } from '@testing-library/react-native';
import { estoqueComCadastros } from '../testes/fabricas';
import { LancamentoTela } from './LancamentoTela';

const fotos = { tirarFoto: async () => undefined, escolherDaGaleria: async () => 'file://pedido.jpg' };

describe('LancamentoTela', () => {
  it('registra entrada com nota fiscal e caixa convertida em peças', async () => {
    const { estoque, piso, tinta } = await estoqueComCadastros();
    await render(<LancamentoTela estoque={estoque} tipo="entrada" hoje="2026-11-11" servicoFotos={fotos} />);
    await fireEvent.changeText(screen.getByTestId('nota'), '4521');
    await fireEvent.changeText(screen.getByTestId('fornecedor'), 'Iquine');
    await fireEvent.press(screen.getByTestId('adicionar-item'));
    await fireEvent.press(await screen.findByTestId(`item-opcao-${piso.id}`));
    await fireEvent.press(screen.getByTestId(`unidade-${piso.id}-emb`));
    await fireEvent.changeText(screen.getByTestId(`qtd-${piso.id}`), '2');
    await fireEvent.changeText(screen.getByTestId(`custo-${piso.id}`), '50,60');
    await fireEvent.press(screen.getByTestId('adicionar-item'));
    await fireEvent.press(await screen.findByTestId(`item-opcao-${tinta.id}`));
    await fireEvent.changeText(screen.getByTestId(`qtd-${tinta.id}`), '3');
    await fireEvent.changeText(screen.getByTestId(`custo-${tinta.id}`), '150');
    await fireEvent.press(screen.getByTestId('salvar'));
    expect(await screen.findByTestId('ok')).toHaveTextContent('Entrada registrada (2 itens).');
    const p = await estoque.posicao();
    expect(p.itens[piso.id].quantidade).toBe(22);
    expect(p.itens[piso.id].valor).toBeCloseTo(101.2);
    expect((await estoque.movimentos())[0].notaFiscal).toBe('4521');
  });

  it('saída: exige frente e quem retirou, anexa a foto do pedido e mostra erro de saldo', async () => {
    const { estoque, tinta, riachuelo, joao } = await estoqueComCadastros();
    await estoque.lancar({ tipo: 'entrada', data: '2026-11-01', linhas: [{ itemId: tinta.id, quantidade: 2, custoUnitario: 10 }] });
    await render(<LancamentoTela estoque={estoque} tipo="saida" hoje="2026-11-11" servicoFotos={fotos} />);
    await fireEvent.press(screen.getByTestId('adicionar-item'));
    await fireEvent.press(await screen.findByTestId(`item-opcao-${tinta.id}`));
    expect(screen.getByText('Saldo no galpão: 2 lata')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId(`qtd-${tinta.id}`), '3');
    await fireEvent.press(screen.getByTestId('salvar'));
    expect(await screen.findByTestId('erro')).toHaveTextContent('Informe a frente de serviço de destino');
    await fireEvent.press(screen.getByTestId('local'));
    await fireEvent.press(await screen.findByTestId(`local-opcao-${riachuelo.id}`));
    await fireEvent.press(screen.getByTestId('funcionario'));
    await fireEvent.press(await screen.findByTestId(`funcionario-opcao-${joao.id}`));
    await fireEvent.press(screen.getByTestId('salvar'));
    expect(await screen.findByTestId('erro')).toHaveTextContent('Saldo insuficiente: TINTA BRANCA 18L — disponível 2 lata');
    await fireEvent.changeText(screen.getByTestId(`qtd-${tinta.id}`), '2');
    await fireEvent.press(screen.getByTestId('foto-galeria'));
    await fireEvent.press(screen.getByTestId('salvar'));
    expect(await screen.findByTestId('ok')).toHaveTextContent('Saída registrada (1 item).');
    const s = (await estoque.movimentos()).find((m) => m.tipo === 'saida')!;
    expect((await estoque.anexos(s.grupo)).map((a) => a.uri)).toEqual(['file://pedido.jpg']);
  });

  it('não aceita data futura', async () => {
    const { estoque } = await estoqueComCadastros();
    await render(<LancamentoTela estoque={estoque} tipo="entrada" hoje="2026-11-11" servicoFotos={fotos} />);
    await fireEvent.changeText(screen.getByTestId('data'), '12/11/2026');
    await fireEvent.press(screen.getByTestId('salvar'));
    expect(await screen.findByTestId('erro')).toHaveTextContent('A data não pode ser futura');
  });
});
