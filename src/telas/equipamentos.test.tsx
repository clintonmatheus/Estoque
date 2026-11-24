import { fireEvent, render, screen } from '@testing-library/react-native';
import { posicoesDoBem } from '../domain/bens';
import { estoqueComCadastros } from '../testes/fabricas';
import { Raiz } from './Raiz';

const fotos = { tirarFoto: async () => undefined, escolherDaGaleria: async () => undefined };
const saida = { pdf: jest.fn(async () => {}), xlsx: jest.fn(async () => {}) };
const base = { servicoFotos: fotos, saida, hoje: '2026-11-11', agora: () => '2026-11-11T18:00:00.000Z', carregarSaldos: async () => [] };
const galpao = { tipo: 'galpao' } as const;

describe('Equipamentos', () => {
  it('levantamento: cadastra equipamento locado por quantidade e depois leva peças para uma obra', async () => {
    const { estoque, joao, riachuelo } = await estoqueComCadastros();
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-equipamentos'));
    await fireEvent.press(await screen.findByTestId('novo-bem'));
    await fireEvent.press(screen.getByTestId('bem-tipo-locado'));
    await fireEvent.changeText(screen.getByTestId('bem-nome'), 'Escora metálica');
    await fireEvent.changeText(screen.getByTestId('loc-locadora'), 'Agaé Locação');
    await fireEvent.changeText(screen.getByTestId('loc-contrato'), '1234');
    await fireEvent.changeText(screen.getByTestId('loc-valor'), '2,50');
    await fireEvent.changeText(screen.getByTestId('loc-fim'), '14/11/2026');
    await fireEvent.press(screen.getByTestId('loc-cobrada'));
    await fireEvent.press(await screen.findByTestId(`loc-cobrada-opcao-${riachuelo.id}`));
    await fireEvent.changeText(screen.getByTestId('bem-qtd'), '100');
    await fireEvent.press(screen.getByTestId('bem-salvar'));
    // abre o detalhe do cadastro criado
    expect(await screen.findByText('Locação vence em 3 d')).toBeTruthy();
    expect(screen.getByText('Locadora: Agaé Locação · contrato 1234')).toBeTruthy();
    const [escora] = await estoque.bens();
    expect(posicoesDoBem(await estoque.movimentosBens(), escora.id)[0].quantidade).toBe(100);
    // movimenta 40 peças para o João na obra Riachuelo
    await fireEvent.changeText(screen.getByTestId('mov-qtd'), '40');
    await fireEvent.press(screen.getByTestId('mov-origem'));
    await fireEvent.press(await screen.findByTestId('mov-origem-opcao-galpao'));
    await fireEvent.press(screen.getByTestId('mov-pessoa'));
    await fireEvent.press(await screen.findByTestId(`mov-pessoa-opcao-${joao.id}`));
    await fireEvent.press(screen.getByTestId('mov-obra'));
    await fireEvent.press(await screen.findByTestId(`mov-obra-opcao-${riachuelo.id}`));
    await fireEvent.press(screen.getByTestId('registrar-mov'));
    expect(await screen.findByTestId('ok')).toHaveTextContent('Movimentação registrada.');
    const pos = posicoesDoBem(await estoque.movimentosBens(), escora.id);
    expect(pos.map((p) => p.quantidade)).toEqual([60, 40]);
    expect(screen.getByText('João · Riachuelo')).toBeTruthy();
  });

  it('mostra erro de saldo e não deixa ferramenta individual sair de onde não está', async () => {
    const { estoque, joao, riachuelo } = await estoqueComCadastros();
    const escora = await estoque.cadastrarBem({ nome: 'Escora', tipo: 'locado', controle: 'quantidade', ativo: true, locacao: { locadora: 'Agaé' } }, { posse: galpao, quantidade: 10, data: '2026-11-01' });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-equipamentos'));
    await fireEvent.press(await screen.findByTestId(`bem-${escora.id}`));
    await fireEvent.changeText(screen.getByTestId('mov-qtd'), '11');
    await fireEvent.press(screen.getByTestId('mov-origem'));
    await fireEvent.press(await screen.findByTestId('mov-origem-opcao-galpao'));
    await fireEvent.press(screen.getByTestId('mov-pessoa'));
    await fireEvent.press(await screen.findByTestId(`mov-pessoa-opcao-${joao.id}`));
    await fireEvent.press(screen.getByTestId('mov-obra'));
    await fireEvent.press(await screen.findByTestId(`mov-obra-opcao-${riachuelo.id}`));
    await fireEvent.press(screen.getByTestId('registrar-mov'));
    expect(await screen.findByTestId('erro')).toHaveTextContent('Saldo insuficiente: ESCORA — galpão tem 10');
  });

  it('alertas: ferramenta atrasada, locação vencida e peças na obra errada aparecem na aba e no filtro', async () => {
    const { estoque, joao, riachuelo } = await estoqueComCadastros();
    const pedra = await estoque.salvarLocal({ nome: 'Pedra Grande', centroCusto: 'RMG', ativo: true });
    const serra = await estoque.cadastrarBem({ nome: 'Serra', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: galpao, quantidade: 1, data: '2026-11-01' });
    await estoque.movimentarBem({ bemId: serra.id, data: '2026-11-02', quantidade: 1, origem: galpao, destino: { tipo: 'campo', funcionarioId: joao.id, localId: riachuelo.id }, prevista: '2026-11-08' });
    const escora = await estoque.cadastrarBem({
      nome: 'Escora', tipo: 'locado', controle: 'quantidade', ativo: true, locacao: { locadora: 'Agaé', localCobrancaId: riachuelo.id, prevista: '2026-12-30' },
    }, { posse: galpao, quantidade: 10, data: '2026-11-01' });
    await estoque.movimentarBem({ bemId: escora.id, data: '2026-11-02', quantidade: 4, origem: galpao, destino: { tipo: 'campo', funcionarioId: joao.id, localId: pedra.id } });
    await estoque.cadastrarBem({ nome: 'Alicate', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: galpao, quantidade: 1, data: '2026-11-01' });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    expect(await screen.findByTestId('aviso-equipamentos')).toHaveTextContent('2');
    await fireEvent.press(screen.getByTestId('aba-equipamentos'));
    expect(await screen.findByText('Devolução atrasada 3 d')).toBeTruthy();
    expect(screen.getByText('4 em Pedra Grande, outra obra que a cobrada')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('equip-alertas'));
    expect(screen.queryByText('ALICATE')).toBeNull();
    expect(screen.getByText('SERRA')).toBeTruthy();
  });

  it('cancela uma movimentação com motivo e a peça volta', async () => {
    const { estoque, joao, riachuelo } = await estoqueComCadastros();
    const serra = await estoque.cadastrarBem({ nome: 'Serra', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: galpao, quantidade: 1, data: '2026-11-01' });
    const m = await estoque.movimentarBem({ bemId: serra.id, data: '2026-11-02', quantidade: 1, origem: galpao, destino: { tipo: 'campo', funcionarioId: joao.id, localId: riachuelo.id } });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-equipamentos'));
    await fireEvent.press(await screen.findByTestId(`bem-${serra.id}`));
    await fireEvent.press(await screen.findByTestId(`cancelar-mov-${m.id}`));
    await fireEvent.changeText(screen.getByTestId('mov-motivo'), 'lançada errada');
    await fireEvent.press(screen.getByTestId('confirmar-cancelar-mov'));
    expect(await screen.findByText(/Cancelado por Marilia — lançada errada/)).toBeTruthy();
    expect(posicoesDoBem(await estoque.movimentosBens(), serra.id)[0].posse).toEqual(galpao);
  });
});

describe('EPI (aba própria)', () => {
  it('abre em Entregar; entrega com CA, tamanho e validade e mostra na aba de trocas', async () => {
    const { estoque, joao } = await estoqueComCadastros();
    const bota = await estoque.salvarItem({ nome: 'Bota', unidade: 'par', estoqueMinimo: 0, ativo: true });
    await estoque.lancar({ tipo: 'entrada', data: '2026-04-01', linhas: [{ itemId: bota.id, quantidade: 5, custoUnitario: 80 }] });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-epi'));
    await fireEvent.press(await screen.findByTestId('adicionar-item'));
    await fireEvent.press(await screen.findByTestId(`item-opcao-${bota.id}`));
    await fireEvent.changeText(screen.getByTestId(`qtd-${bota.id}`), '1');
    await fireEvent.press(screen.getByTestId('funcionario'));
    await fireEvent.press(await screen.findByTestId(`funcionario-opcao-${joao.id}`));
    await fireEvent.changeText(screen.getByTestId(`ca-${bota.id}`), '999');
    await fireEvent.changeText(screen.getByTestId(`tamanho-${bota.id}`), '42');
    await fireEvent.changeText(screen.getByTestId(`validade-${bota.id}`), '05/11/2026');
    await fireEvent.press(screen.getByTestId('salvar'));
    expect(await screen.findByTestId('ok')).toHaveTextContent('Entrega de EPI registrada (1 item).');
    expect(await screen.findByTestId('aviso-epi')).toHaveTextContent('1');
    await fireEvent.press(screen.getByTestId('epi-trocas'));
    const [m] = (await estoque.movimentos()).filter((x) => x.tipo === 'epi');
    expect(await screen.findByTestId(`epi-${m.id}`)).toHaveTextContent('Vencido há 6 d');
    await fireEvent.press(screen.getByTestId('epi-fichas'));
    await fireEvent.press(screen.getByTestId('epi-funcionario'));
    await fireEvent.press(await screen.findByTestId(`epi-funcionario-opcao-${joao.id}`));
    expect(await screen.findByText(/CA 999 · tam\. 42 · trocar em 05\/11\/2026/)).toBeTruthy();
  });

  it('Lançar não tem mais a opção EPI', async () => {
    const { estoque } = await estoqueComCadastros();
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-lancar'));
    expect(screen.queryByTestId('tipo-epi')).toBeNull();
    expect(screen.getByTestId('tipo-saida')).toBeTruthy();
  });
});
