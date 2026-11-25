import { fireEvent, render, screen } from '@testing-library/react-native';
import { posicoesDoBem } from '../domain/bens';
import { estoqueComCadastros } from '../testes/fabricas';
import { ABAS_EPI } from '../importacao/epi';
import { planilha } from '../testes/planilha';
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
    const { estoque } = await estoqueComCadastros();
    const joao = await estoque.salvarFuncionario({ nome: 'João EPI', ativo: true, grupo: 'epi' });
    const bota = await estoque.salvarItem({ nome: 'Bota', unidade: 'par', estoqueMinimo: 0, ativo: true, categoria: 'EPI' });
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

  it('só mostra itens e funcionários de EPI; sugere CA, tamanho do cadastro e data de troca; tamanho pode ser outro', async () => {
    const { estoque, tinta } = await estoqueComCadastros();
    const ze = await estoque.salvarFuncionario({ nome: 'José', ativo: true, grupo: 'epi', tamanhos: { calcado: '41' } });
    const bota = await estoque.salvarItem({ nome: 'Bota', unidade: 'par', estoqueMinimo: 0, ativo: true, categoria: 'EPI', ca: '42291', vidaUtilDias: 180, tipoTamanho: 'calcado', tamanhos: ['40', '41', '42'] });
    await estoque.lancar({ tipo: 'entrada', data: '2026-04-01', linhas: [{ itemId: bota.id, quantidade: 5 }] });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-epi'));
    await fireEvent.press(await screen.findByTestId('adicionar-item'));
    expect(await screen.findByTestId(`item-opcao-${bota.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`item-opcao-${tinta.id}`)).toBeNull(); // material do galpão não aparece
    await fireEvent.press(screen.getByTestId(`item-opcao-${bota.id}`));
    await fireEvent.press(screen.getByTestId('funcionario'));
    expect(screen.queryByTestId('funcionario-opcao-' + (await estoque.funcionarios(false, 'galpao'))[0].id)).toBeNull(); // quem retira material não aparece
    await fireEvent.press(await screen.findByTestId(`funcionario-opcao-${ze.id}`));
    expect(screen.getByTestId(`ca-${bota.id}`).props.value).toBe('42291');
    expect(screen.getByTestId(`tamanho-${bota.id}`).props.value).toBe('41');
    expect(screen.getByTestId(`validade-${bota.id}`).props.value).toBe('10/05/2027'); // hoje (11/11/2026) + 180 dias
    await fireEvent.press(screen.getByTestId(`tam-${bota.id}-42`)); // entrega outro tamanho
    await fireEvent.changeText(screen.getByTestId(`qtd-${bota.id}`), '1');
    await fireEvent.press(screen.getByTestId('salvar'));
    expect(await screen.findByTestId('ok')).toHaveTextContent('Entrega de EPI registrada (1 item).');
    const [m] = (await estoque.movimentos()).filter((x) => x.tipo === 'epi');
    expect(m).toMatchObject({ ca: '42291', tamanho: '42', validade: '2027-05-10', funcionarioId: ze.id });
  });

  it('Lançar não tem mais a opção EPI', async () => {
    const { estoque } = await estoqueComCadastros();
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} />);
    await fireEvent.press(screen.getByTestId('aba-lancar'));
    expect(screen.queryByTestId('tipo-epi')).toBeNull();
    expect(screen.getByTestId('tipo-saida')).toBeTruthy();
  });
});

describe('EPI: cadastros e importação pela tela', () => {
  it('cadastra funcionário de EPI com tamanhos e importa itens pela planilha', async () => {
    const { estoque } = await estoqueComCadastros();
    let arquivo = await planilha({ 'Itens EPI': [[...ABAS_EPI.itens.colunas], ['Capacete', 'un', '123', 365, undefined, undefined, 2, 8]] });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} escolherPlanilha={async () => arquivo} />);
    await fireEvent.press(screen.getByTestId('aba-mais'));
    await fireEvent.press(screen.getByTestId('abrir-cadastros'));
    await fireEvent.press(await screen.findByTestId('aba-func-epi'));
    await fireEvent.press(screen.getByTestId('novo'));
    await fireEvent.changeText(screen.getByTestId('nome'), 'Maria');
    await fireEvent.changeText(screen.getByTestId('cpf'), '529.982.247-25');
    await fireEvent.changeText(screen.getByTestId('funcao'), 'Servente');
    await fireEvent.changeText(screen.getByTestId('tam-calcado'), '38');
    await fireEvent.press(screen.getByTestId('salvar-cadastro'));
    expect(await screen.findByText('Servente · 529.982.247-25 · calçado 38')).toBeTruthy();
    expect((await estoque.funcionarios(true, 'galpao')).map((f) => f.nome)).toEqual(['João']);

    await fireEvent.press(screen.getByTestId('aba-mais'));
    await fireEvent.press(await screen.findByTestId('abrir-importar-epi'));
    await fireEvent.press(screen.getByTestId('escolher-planilha-epi'));
    expect(await screen.findByText('• 1 item(ns) de EPI novo(s)')).toBeTruthy();
    expect(screen.getByText('• 1 item(ns) com saldo inicial')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirmar-importacao-epi'));
    expect(await screen.findByText(/Importação concluída: 1 item\(ns\) de EPI novo\(s\); 1 item\(ns\) com saldo inicial/)).toBeTruthy();
    const cap = (await estoque.itens(true, 'epi'))[0];
    expect(cap).toMatchObject({ nome: 'CAPACETE', ca: '123', vidaUtilDias: 365, estoqueMinimo: 2 });
    expect((await estoque.posicao()).itens[cap.id].quantidade).toBe(8);
  });
});
