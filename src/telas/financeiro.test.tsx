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
    await fireEvent.press(screen.getByTestId('aba-mais'));
    await fireEvent.press(screen.getByTestId('abrir-financeiro'));
    await fireEvent.press(await screen.findByTestId('iniciais'));
    expect(await screen.findByText('Criados: 2 empresas, 6 contas, 4 centros de custo e 19 tipos de despesa.')).toBeTruthy();
    expect(screen.getByText('Nubank Passos')).toBeTruthy();

    // Centros: o contrato do estoque "Escritórios da RMG" vira centro da ALN e as duas frentes ficam ligadas
    await fireEvent.press(screen.getByTestId('fin-centros'));
    expect(await screen.findByText('Contrato do estoque sem centro de custo: Escritórios da RMG')).toBeTruthy();
    const aln = (await financeiro.empresas()).find((x) => x.apelido === 'ALN')!;
    await fireEvent.press(screen.getByTestId(`criar-empresa-Escritórios da RMG-${aln.id}`));
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

  it('pagador vê os cadastros só para consulta e também os saldos do galpão', async () => {
    const t = financeiroDeTeste(CLINTON_FIN);
    await t.financeiro.criarCadastrosIniciais();
    await t.financeiro.salvarFornecedor({ nome: 'Casa do Construtor', forma: 'fatura', diaFechamento: 'sexta', ativo: true });
    const { financeiro } = financeiroDeTeste(PAGADORA, t.armazenamento);
    const carregar = jest.fn(async () => [{ itemId: 't', nome: 'TINTA', unidade: 'lata', estoqueMinimo: 2, saldo: 1 }]);
    await render(<Raiz {...base} usuario={PAGADORA} financeiro={financeiro} carregarSaldos={carregar} />);
    expect(await screen.findByText('Consulta. Só o administrador do financeiro altera os cadastros.')).toBeTruthy();
    expect(screen.queryByTestId('nova-empresa')).toBeNull();
    expect(screen.getByText('BB ALN')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('fin-fornecedores'));
    expect(await screen.findByText('Fatura semanal · fecha sexta')).toBeTruthy();
    expect(screen.queryByTestId('novo-fornecedor')).toBeNull();
    await fireEvent.press(screen.getByTestId('tela-saldos'));
    await waitFor(() => expect(screen.getByText('TINTA')).toBeTruthy());
  });

  it('administrador só do financeiro importa a planilha de cadastros pela tela', async () => {
    const admin = { ...PAGADORA, id: 'u-adm2', nome: 'Adm 2', financeiro: 'admin' as const };
    const { financeiro } = financeiroDeTeste(admin);
    const bytes = await planilha({
      Empresas: [[...ABAS_FIN.empresas.colunas], ['ALN', 'A. L. N. Serviços e Construções Ltda.']],
      'Centros de custo': [[...ABAS_FIN.centros.colunas], ['RMG ÁGUA', 'ALN', 'Obra', 'CAIXA RMG'], ['SMS', 'XYZ']],
    });
    let arquivo = bytes;
    await render(<Raiz {...base} usuario={admin} financeiro={financeiro} carregarSaldos={async () => []} escolherPlanilha={async () => arquivo} />);
    await fireEvent.press(await screen.findByTestId('fin-importar'));
    await fireEvent.press(screen.getByTestId('escolher-planilha-fin'));
    expect(await screen.findByText('Centros de custo, linha 3: Empresa "XYZ" não encontrada (cadastre na aba Empresas ou no app)')).toBeTruthy();
    expect(screen.queryByTestId('confirmar-importacao-fin')).toBeNull();
    arquivo = await planilha({
      Empresas: [[...ABAS_FIN.empresas.colunas], ['ALN', 'A. L. N. Serviços e Construções Ltda.']],
      'Centros de custo': [[...ABAS_FIN.centros.colunas], ['RMG ÁGUA', 'ALN', 'Obra', 'CAIXA RMG'], ['SMS', 'ALN']],
    });
    await fireEvent.press(screen.getByTestId('escolher-planilha-fin'));
    expect(await screen.findByText('• 2 centro(s) de custo')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('confirmar-importacao-fin'));
    expect(await screen.findByText('Importação concluída: 1 empresa(s); 2 centro(s) de custo.')).toBeTruthy();
    expect((await financeiro.centros()).map((c) => c.nome)).toEqual(['RMG ÁGUA', 'SMS']);
  });

  it('almoxarife sem perfil no financeiro não vê o menu do financeiro', async () => {
    const e = await estoqueComCadastros(MARILIA);
    const { financeiro } = financeiroDeTeste(MARILIA, e.armazenamento);
    await render(<Raiz {...base} usuario={MARILIA} estoque={e.estoque} financeiro={financeiro} carregarSaldos={async () => []} />);
    await fireEvent.press(screen.getByTestId('aba-mais'));
    expect(screen.queryByTestId('abrir-financeiro')).toBeNull();
  });
});
