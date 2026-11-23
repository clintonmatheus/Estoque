import { fireEvent, render, screen } from '@testing-library/react-native';
import { estoqueComCadastros } from '../testes/fabricas';
import { LancamentoTela } from './LancamentoTela';
import { Raiz } from './Raiz';

const fotos = { tirarFoto: async () => undefined, escolherDaGaleria: async () => undefined };
const saida = { pdf: jest.fn(async () => {}), xlsx: jest.fn(async () => {}) };
const base = { servicoFotos: fotos, saida, hoje: '2026-11-11', agora: () => '2026-11-11T18:00:00.000Z', carregarSaldos: async () => [] };

describe('Ferramentas', () => {
  it('cadastra, empresta com prazo, mostra atrasada e registra a devolução', async () => {
    const { estoque, joao } = await estoqueComCadastros();
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    // cadastro
    await fireEvent.press(screen.getByTestId('aba-mais'));
    await fireEvent.press(screen.getByTestId('abrir-cadastros'));
    await fireEvent.press(await screen.findByTestId('aba-ferramentas'));
    await fireEvent.press(screen.getByTestId('novo'));
    await fireEvent.changeText(screen.getByTestId('nome'), 'Furadeira');
    await fireEvent.changeText(screen.getByTestId('codigo'), '03');
    await fireEvent.press(screen.getByTestId('salvar-cadastro'));
    expect(await screen.findByText('FURADEIRA 03')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('voltar'));
    // empréstimo
    await fireEvent.press(screen.getByTestId('abrir-ferramentas'));
    const [f] = await estoque.ferramentas();
    expect(await screen.findByTestId(`situacao-${f.id}`)).toHaveTextContent('No galpão');
    await fireEvent.press(screen.getByTestId(`ferramenta-${f.id}`));
    await fireEvent.press(screen.getByTestId('emprestimo-funcionario'));
    await fireEvent.press(await screen.findByTestId(`emprestimo-funcionario-opcao-${joao.id}`));
    expect((screen.getByTestId('emprestimo-prevista').props as { value: string }).value).toBe('18/11/2026'); // prazo padrão de 7 dias
    await fireEvent.changeText(screen.getByTestId('emprestimo-saida'), '01/11/2026');
    await fireEvent.changeText(screen.getByTestId('emprestimo-prevista'), '08/11/2026');
    await fireEvent.press(screen.getByTestId('emprestar'));
    expect(await screen.findByTestId('ok')).toHaveTextContent('Empréstimo registrado.');
    expect(screen.getByText('Atrasada há 3 dia(s)')).toBeTruthy();
    // devolução
    await fireEvent.changeText(screen.getByTestId('devolucao-estado'), 'cabo solto');
    await fireEvent.press(screen.getByTestId('devolver'));
    expect(await screen.findByTestId('ok')).toHaveTextContent('Devolução registrada.');
    expect(screen.getByText('Estado: cabo solto')).toBeTruthy();
    expect(screen.getByText(/Devolvida com 3 dia\(s\) de atraso/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('voltar-ferramentas'));
    expect(await screen.findByTestId(`situacao-${f.id}`)).toHaveTextContent('No galpão');
  });

  it('menu avisa quantas estão atrasadas e o filtro "Atrasadas" mostra só elas', async () => {
    const { estoque, joao } = await estoqueComCadastros();
    const a = await estoque.salvarFerramenta({ nome: 'Escada', ativo: true });
    const b = await estoque.salvarFerramenta({ nome: 'Serra', ativo: true });
    await estoque.emprestar({ ferramentaId: a.id, funcionarioId: joao.id, saida: '2026-11-01', prevista: '2026-11-05' });
    await estoque.emprestar({ ferramentaId: b.id, funcionarioId: joao.id, saida: '2026-11-10', prevista: '2026-11-20' });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-mais'));
    expect(await screen.findByText('2 fora do galpão · 1 atrasada(s)')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('abrir-ferramentas'));
    await fireEvent.press(await screen.findByTestId('ferr-atrasadas'));
    expect(screen.getByTestId(`ferramenta-${a.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`ferramenta-${b.id}`)).toBeNull();
  });
});

describe('EPI', () => {
  it('entrega pelo Lançar com CA, tamanho e validade; aparece nas trocas do menu', async () => {
    const { estoque, joao } = await estoqueComCadastros();
    const bota = await estoque.salvarItem({ nome: 'Bota', unidade: 'par', estoqueMinimo: 0, ativo: true });
    await estoque.lancar({ tipo: 'entrada', data: '2026-11-01', linhas: [{ itemId: bota.id, quantidade: 5, custoUnitario: 80 }] });
    await render(<LancamentoTela estoque={estoque} tipo="epi" hoje="2026-11-11" servicoFotos={fotos} />);
    await fireEvent.press(screen.getByTestId('salvar'));
    await fireEvent.press(screen.getByTestId('adicionar-item'));
    await fireEvent.press(await screen.findByTestId(`item-opcao-${bota.id}`));
    await fireEvent.changeText(screen.getByTestId(`qtd-${bota.id}`), '1');
    await fireEvent.press(screen.getByTestId('salvar'));
    expect(await screen.findByTestId('erro')).toHaveTextContent('Informe o funcionário');
    await fireEvent.press(screen.getByTestId('funcionario'));
    await fireEvent.press(await screen.findByTestId(`funcionario-opcao-${joao.id}`));
    await fireEvent.changeText(screen.getByTestId(`ca-${bota.id}`), '12345');
    await fireEvent.changeText(screen.getByTestId(`tamanho-${bota.id}`), '42');
    await fireEvent.changeText(screen.getByTestId(`validade-${bota.id}`), '20/11/2026');
    await fireEvent.press(screen.getByTestId('salvar'));
    expect(await screen.findByTestId('ok')).toHaveTextContent('Entrega de EPI registrada (1 item).');
    const [m] = (await estoque.movimentos()).filter((x) => x.tipo === 'epi');
    expect(m).toMatchObject({ ca: '12345', tamanho: '42', validade: '2026-11-20', funcionarioId: joao.id });
    expect((await estoque.posicao()).itens[bota.id].quantidade).toBe(4);
  });

  it('tela de EPI lista as trocas e a ficha do funcionário', async () => {
    const { estoque, joao } = await estoqueComCadastros();
    const bota = await estoque.salvarItem({ nome: 'Bota', unidade: 'par', estoqueMinimo: 0, ativo: true });
    await estoque.lancar({ tipo: 'entrada', data: '2026-04-01', linhas: [{ itemId: bota.id, quantidade: 5, custoUnitario: 80 }] });
    const [m] = await estoque.lancar({ tipo: 'epi', data: '2026-05-01', funcionarioId: joao.id, linhas: [{ itemId: bota.id, quantidade: 1, ca: '999', validade: '2026-11-05' }] });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-mais'));
    expect(await screen.findByText('1 para trocar')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('abrir-epi'));
    expect(await screen.findByTestId(`epi-${m.id}`)).toHaveTextContent('Vencido há 6 d');
    expect(screen.getByText('João')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('epi-fichas'));
    await fireEvent.press(screen.getByTestId('epi-funcionario'));
    await fireEvent.press(await screen.findByTestId(`epi-funcionario-opcao-${joao.id}`));
    expect(await screen.findByText(/01\/05\/2026 · 1 un\. · CA 999 · trocar em 05\/11\/2026/)).toBeTruthy();
  });
});
