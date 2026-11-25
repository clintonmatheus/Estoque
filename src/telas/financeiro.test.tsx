import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { planilha } from '../testes/planilha';
import { ABAS_FIN } from '../importacao/cadastrosFinanceiro';
import { CLINTON_FIN, estoqueComCadastros, financeiroDeTeste, MARILIA, PAGADORA } from '../testes/fabricas';
import { Raiz } from './Raiz';

const fotos = { tirarFoto: async () => undefined, escolherDaGaleria: async () => undefined };
const saida = { pdf: jest.fn(async () => {}), xlsx: jest.fn(async () => {}) };
const base = { servicoFotos: fotos, saida, hoje: '2026-11-24', agora: () => '2026-11-24T18:00:00.000Z' };

describe('Financeiro na tela', () => {
  it('administrador cria os cadastros iniciais, liga as frentes do estoque e cadastra fornecedor', async () => {
    const e = await estoqueComCadastros(CLINTON_FIN);
    const { financeiro } = financeiroDeTeste(CLINTON_FIN, e.armazenamento);
    await render(<Raiz {...base} usuario={CLINTON_FIN} estoque={e.estoque} financeiro={financeiro} carregarSaldos={async () => []} />);
    await fireEvent.press(screen.getByTestId('pilar-financeiro'));
    await fireEvent.press(await screen.findByTestId('iniciais'));
    expect(await screen.findByText('Criados: 2 empresas, 6 contas, 2 centros de custo, 20 tipos de despesa e 2 encargos.')).toBeTruthy();
    expect(screen.getByText('Nubank Passos')).toBeTruthy();

    // Centros: o contrato do estoque "Escritórios da RMG" vira centro e as duas frentes ficam ligadas
    await fireEvent.press(screen.getByTestId('fin-centros'));
    expect(await screen.findByText('Contrato do estoque sem centro de custo: Escritórios da RMG')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('criar-centro-Escritórios da RMG'));
    expect(await screen.findByText('2 frentes ligadas ao centro de custo.')).toBeTruthy();
    expect(screen.getByText('2 frentes: Macaíba, Riachuelo')).toBeTruthy();

    // Fornecedor com chave Pix (CNPJ) conferida
    await fireEvent.press(screen.getByTestId('fin-fornecedores'));
    await fireEvent.press(await screen.findByTestId('novo-fornecedor'));
    await fireEvent.changeText(screen.getByTestId('nome'), 'Aço Potiguar');
    await fireEvent.changeText(screen.getByTestId('pix'), '05948553000275');
    expect(screen.getByText('Chave do tipo CNPJ')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('salvar-cadastro'));
    expect(await screen.findByText('Aço Potiguar')).toBeTruthy();
    expect(screen.getByText('Pix (CNPJ): 05948553000275')).toBeTruthy();
  });

  it('pagador (sem estoque) vê só Pagamentos e Conta: o pilar Financeiro é dos administradores', async () => {
    const t = financeiroDeTeste(CLINTON_FIN);
    await t.financeiro.criarCadastrosIniciais();
    const { financeiro } = financeiroDeTeste(PAGADORA, t.armazenamento);
    await render(<Raiz {...base} usuario={PAGADORA} financeiro={financeiro} carregarSaldos={async () => []} />);
    expect(await screen.findByTestId('novo-pedido')).toBeTruthy();
    expect(screen.getByTestId('pilar-pagamentos')).toBeTruthy();
    expect(screen.queryByTestId('pilar-financeiro')).toBeNull();
    expect(screen.queryByTestId('pilar-estoque')).toBeNull();
    await fireEvent.press(screen.getByTestId('pilar-conta'));
    expect(screen.getByTestId('acesso-pagamentos')).toHaveTextContent('faz pedidos, confere e paga');
    expect(screen.queryByTestId('acesso-financeiro')).toBeNull();
  });

  it('administrador só do financeiro importa a planilha de cadastros pela tela', async () => {
    const admin = { ...PAGADORA, id: 'u-adm2', nome: 'Adm 2', financeiro: 'admin' as const };
    const { financeiro } = financeiroDeTeste(admin);
    const bytes = await planilha({
      Empresas: [[...ABAS_FIN.empresas.colunas], ['ALN', 'A. L. N. Serviços e Construções Ltda.']],
      'Centros de custo': [[...ABAS_FIN.centros.colunas], ['RMG ÁGUA', 'Obra', 'Ativo', 'ALN', 'CAIXA RMG'], ['SMS', 'Obra', 'Ativo', 'XYZ']],
    });
    let arquivo = bytes;
    await render(<Raiz {...base} usuario={admin} financeiro={financeiro} carregarSaldos={async () => []} escolherPlanilha={async () => arquivo} />);
    await fireEvent.press(await screen.findByTestId('pilar-financeiro'));
    await fireEvent.press(await screen.findByTestId('fin-importar'));
    await fireEvent.press(screen.getByTestId('escolher-planilha-fin'));
    expect(await screen.findByText('Centros de custo, linha 3: Empresa "XYZ" não encontrada (cadastre na aba Empresas ou no app)')).toBeTruthy();
    expect(screen.queryByTestId('confirmar-importacao-fin')).toBeNull();
    arquivo = await planilha({
      Empresas: [[...ABAS_FIN.empresas.colunas], ['ALN', 'A. L. N. Serviços e Construções Ltda.']],
      'Centros de custo': [[...ABAS_FIN.centros.colunas], ['RMG ÁGUA', 'Obra', 'Ativo', 'ALN', 'CAIXA RMG'], ['SMS']],
    });
    await fireEvent.press(screen.getByTestId('escolher-planilha-fin'));
    expect(await screen.findByText('• 2 centro(s) de custo')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirmar-importacao-fin'));
    expect(await screen.findByText('Importação concluída: 1 empresa(s); 2 centro(s) de custo.')).toBeTruthy();
    expect((await financeiro.centros()).map((c) => c.nome)).toEqual(['RMG ÁGUA', 'SMS']);
  });

  it('custo fixo mensal no centro e mudança de percentual de encargos a partir de um mês', async () => {
    const { financeiro } = financeiroDeTeste(CLINTON_FIN);
    await financeiro.criarCadastrosIniciais();
    const rmg = await financeiro.salvarCentro({ nome: 'RMG ÁGUA', ativo: true });
    const despesa = (await financeiro.tipos()).find((t) => t.nome === 'Despesa geral')!;
    await render(<Raiz {...base} usuario={{ ...PAGADORA, financeiro: 'admin' }} financeiro={financeiro} carregarSaldos={async () => []} />);
    await fireEvent.press(await screen.findByTestId('pilar-financeiro'));
    await fireEvent.press(await screen.findByTestId('fin-centros'));
    await fireEvent.press(await screen.findByTestId(`centro-${rmg.id}`));
    await fireEvent.press(screen.getByTestId('novo-custo-fixo'));
    await fireEvent.changeText(screen.getByTestId('descricao'), 'Despesa geral');
    await fireEvent.press(screen.getByTestId('tipo-custo'));
    await fireEvent.press(screen.getByTestId(`tipo-custo-opcao-${despesa.id}`));
    await fireEvent.changeText(screen.getByTestId('valor'), '20.000,00');
    await fireEvent.changeText(screen.getByTestId('inicio'), '08/2026');
    await fireEvent.press(screen.getByTestId('salvar-cadastro'));
    expect(await screen.findByText('Despesa geral · R$ 20.000,00/mês')).toBeTruthy();
    expect(screen.getByText('Despesa geral · desde 08/2026')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('desistir'));
    await fireEvent.press(await screen.findByTestId('fin-encargos'));
    const folha = (await financeiro.encargos()).find((e) => e.nome === 'Encargos da folha')!;
    expect(screen.getByTestId(`pct-${folha.id}`)).toHaveTextContent('37,77%');
    await fireEvent.press(screen.getByTestId(`encargo-${folha.id}`));
    await fireEvent.changeText(screen.getByTestId('percentual'), '36,5');
    await fireEvent.changeText(screen.getByTestId('desde'), '01/2030');
    await fireEvent.press(screen.getByTestId('salvar-cadastro'));
    expect(await screen.findByText('Histórico: 37,77% desde o início · 36,5% desde 01/2030')).toBeTruthy();
    expect(screen.getByTestId(`pct-${folha.id}`)).toHaveTextContent('37,77%');
  });

  it('almoxarife sem perfil no financeiro não vê os pilares Pagamentos e Financeiro', async () => {
    const e = await estoqueComCadastros(MARILIA);
    const { financeiro } = financeiroDeTeste(MARILIA, e.armazenamento);
    await render(<Raiz {...base} usuario={MARILIA} estoque={e.estoque} financeiro={financeiro} carregarSaldos={async () => []} />);
    expect(screen.getByTestId('pilar-estoque')).toBeTruthy();
    expect(screen.queryByTestId('pilar-pagamentos')).toBeNull();
    expect(screen.queryByTestId('pilar-financeiro')).toBeNull();
  });
});
