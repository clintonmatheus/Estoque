import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { CLINTON_FIN, financeiroDeTeste, PAGADORA } from '../testes/fabricas';
import { Raiz } from './Raiz';

const saida = { pdf: jest.fn(async () => {}), xlsx: jest.fn(async () => {}) };
const fotos = { tirarFoto: async () => undefined, escolherDaGaleria: async () => undefined };
const base = { servicoFotos: fotos, saida, hoje: '2026-11-24', agora: () => '2026-11-24T18:00:00.000Z', carregarSaldos: async () => [] };

async function cenario() {
  const t = financeiroDeTeste(CLINTON_FIN);
  await t.financeiro.criarCadastrosIniciais();
  const centro = await t.financeiro.salvarCentro({ nome: 'RMG Água', apelidos: [], ativo: true });
  const terc = await t.financeiro.salvarFornecedor({ nome: 'Pintura Silva', chavePix: '05948553000275', forma: 'pix', ativo: true });
  const empresas = await t.financeiro.empresas();
  const contas = await t.financeiro.contas();
  const aln = empresas.find((e) => e.apelido === 'ALN')!;
  const passos = empresas.find((e) => e.apelido !== 'ALN')!;
  const pagar = async (descricao: string, valor: number, empresaId: string, data: string, terceirizado: boolean, quem = t.financeiro.pedidos) => {
    const p = await t.financeiro.pedidos.solicitar({ tipo: 'pix', descricao, valor, centroId: centro.id, fornecedorId: terc.id, ...(terceirizado ? { terceirizado: true } : {}) }, { confirmarDuplicado: true });
    await t.financeiro.pedidos.conferir(p.id);
    return quem.pagar(p.id, { data, empresaId, contaId: contas.find((c) => c.empresaId === empresaId)!.id, valor });
  };
  return { ...t, centro, aln, passos, contas, pagar };
}

describe('terceirizados e filtros de pagamentos na tela', () => {
  it('pagadora vê "Notas pendentes", lança as notas e o acompanhamento fecha quando somam o valor pago', async () => {
    const c = await cenario();
    const p = await c.pagar('Pintura do bloco B', 5000, c.aln.id, '2026-11-20', true);
    const pag = financeiroDeTeste(PAGADORA, c.armazenamento).financeiro;
    await render(<Raiz {...base} usuario={PAGADORA} financeiro={pag} />);
    await fireEvent.press(await screen.findByTestId('pedidos-notas'));
    expect(await screen.findByTestId(`notas-${p.id}`)).toHaveTextContent(/faltam R\$\s*5\.000,00 · há 4 dia/);
    await fireEvent.press(screen.getByTestId(`pedido-${p.id}`));
    expect(await screen.findByTestId('notas-falta')).toHaveTextContent(/5\.000,00/);

    await fireEvent.changeText(screen.getByTestId('nota-numero'), '101');
    await fireEvent.changeText(screen.getByTestId('nota-valor'), '3000');
    await fireEvent.press(screen.getByTestId('lancar-nota'));
    expect(await screen.findByText('Nota lançada.')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('notas-falta')).toHaveTextContent(/2\.000,00/));

    await fireEvent.changeText(screen.getByTestId('nota-numero'), '101');
    await fireEvent.changeText(screen.getByTestId('nota-valor'), '10');
    await fireEvent.press(screen.getByTestId('lancar-nota'));
    expect(await screen.findByText(/já foi lançada/)).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('nota-numero'), '102');
    await fireEvent.changeText(screen.getByTestId('nota-valor'), '2000');
    await fireEvent.press(screen.getByTestId('lancar-nota'));
    expect(await screen.findByText('Nota lançada: as notas fecharam o valor pago.')).toBeTruthy();
    expect(await screen.findByTestId('notas-encerrada')).toBeTruthy();
    expect((await pag.pedidos.obter(p.id))?.terceirizado?.notas).toHaveLength(2);
  });

  it('encerrar sem fechar o valor exige a justificativa', async () => {
    const c = await cenario();
    const p = await c.pagar('Reboco', 4000, c.aln.id, '2026-11-22', true);
    await render(<Raiz {...base} usuario={CLINTON_FIN} financeiro={c.financeiro} />);
    await fireEvent.press(await screen.findByTestId('pilar-pagamentos'));
    await fireEvent.press(await screen.findByTestId('pedidos-notas'));
    await fireEvent.press(await screen.findByTestId(`pedido-${p.id}`));
    await fireEvent.press(await screen.findByTestId('encerrar-notas'));
    expect(await screen.findByText('Explique a diferença entre as notas e o valor pago')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('notas-justificativa'), 'Retenção de INSS');
    await fireEvent.press(screen.getByTestId('encerrar-notas'));
    expect(await screen.findByText('Acompanhamento das notas encerrado.')).toBeTruthy();
    expect((await c.financeiro.pedidos.obter(p.id))?.terceirizado?.encerrada?.justificativa).toBe('Retenção de INSS');
  });

  it('abrir o pedido com a opção "Pagamento a terceirizado" guarda a marca no pedido', async () => {
    const c = await cenario();
    await render(<Raiz {...base} usuario={CLINTON_FIN} financeiro={c.financeiro} />);
    await fireEvent.press(await screen.findByTestId('pilar-pagamentos'));
    await fireEvent.press(await screen.findByTestId('novo-pedido'));
    await fireEvent.press(screen.getByTestId('pedido-fornecedor'));
    await fireEvent.press(await screen.findByTestId('pedido-fornecedor-opcao-' + (await c.financeiro.fornecedores())[0].id));
    await fireEvent.changeText(screen.getByTestId('pedido-descricao'), 'Elétrica');
    await fireEvent.changeText(screen.getByTestId('pedido-valor'), '900');
    await fireEvent.press(screen.getByTestId('pedido-centro'));
    await fireEvent.press(await screen.findByTestId(`pedido-centro-opcao-${c.centro.id}`));
    await fireEvent(screen.getByTestId('pedido-terceirizado'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('enviar-pedido'));
    await waitFor(async () => expect((await c.financeiro.pedidos.lista())[0]?.terceirizado).toEqual({ notas: [] }));
  });

  it('Todos: filtra por empresa, banco, quem pagou e período, e mostra o total', async () => {
    const c = await cenario();
    await c.pagar('Cimento', 1000, c.aln.id, '2026-11-10', false);
    await c.pagar('Areia', 250, c.passos.id, '2026-11-18', false);
    const aberto = await c.financeiro.pedidos.solicitar({ tipo: 'pix', descricao: 'Ainda aberto', valor: 77, centroId: c.centro.id, favorecido: 'Zé', chavePix: 'ze@x.com' });
    await render(<Raiz {...base} usuario={CLINTON_FIN} financeiro={c.financeiro} />);
    await fireEvent.press(await screen.findByTestId('pilar-pagamentos'));
    await fireEvent.press(await screen.findByTestId('pedidos-todos'));
    expect(await screen.findByText(/Cimento/)).toBeTruthy();
    expect(screen.getByText(/Ainda aberto/)).toBeTruthy();
    expect(aberto.status).toBe('enviado');

    await fireEvent.press(screen.getByTestId('filtro-empresa'));
    await fireEvent.press(await screen.findByTestId(`filtro-empresa-opcao-${c.passos.id}`));
    expect(await screen.findByTestId('filtro-total')).toHaveTextContent(/1 pagamento\(s\) · R\$\s*250,00/);
    expect(screen.queryByText(/Cimento/)).toBeNull();
    expect(screen.queryByText(/Ainda aberto/)).toBeNull();

    await fireEvent.press(screen.getByTestId('limpar-filtros'));
    await fireEvent.changeText(screen.getByTestId('filtro-de'), '01/11/2026');
    await fireEvent.changeText(screen.getByTestId('filtro-ate'), '12/11/2026');
    expect(await screen.findByTestId('filtro-total')).toHaveTextContent(/1 pagamento\(s\) · R\$\s*1\.000,00/);

    await fireEvent.press(screen.getByTestId('limpar-filtros'));
    await fireEvent.press(screen.getByTestId('filtro-pagador'));
    await fireEvent.press(await screen.findByTestId(`filtro-pagador-opcao-${CLINTON_FIN.id}`));
    expect(await screen.findByTestId('filtro-total')).toHaveTextContent(/2 pagamento\(s\) · R\$\s*1\.250,00/);
  });
});
