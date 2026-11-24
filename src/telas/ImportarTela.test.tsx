import { fireEvent, render, screen } from '@testing-library/react-native';
import { ABAS } from '../importacao/levantamento';
import { estoqueComCadastros } from '../testes/fabricas';
import { planilha } from '../testes/planilha';
import { Raiz } from './Raiz';

const fotos = { tirarFoto: async () => undefined, escolherDaGaleria: async () => undefined };
const saida = { pdf: jest.fn(async () => {}), xlsx: jest.fn(async () => {}) };
const base = { servicoFotos: fotos, saida, hoje: '2026-11-11', agora: () => '2026-11-11T18:00:00.000Z', carregarSaldos: async () => [] };
const eq = (o: Record<string, string | number>) => ABAS.equipamentos.colunas.map((c) => o[c]);

describe('Importar planilha', () => {
  it('mostra o que será importado e grava ao confirmar', async () => {
    const { estoque } = await estoqueComCadastros();
    const bytes = await planilha({
      Funcionários: [['Nome'], ['Maria']],
      Equipamentos: [[...ABAS.equipamentos.colunas], eq({ Nome: 'Serra', Código: '1', Tipo: 'Ferramenta', Controle: 'Individual' })],
    });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} escolherPlanilha={async () => bytes} />);
    await fireEvent.press(screen.getByTestId('aba-mais'));
    await fireEvent.press(screen.getByTestId('abrir-importar'));
    await fireEvent.press(screen.getByTestId('escolher-planilha'));
    expect(await screen.findByText('• 1 funcionário(s) novo(s)')).toBeTruthy();
    expect(screen.getByText('• 1 ferramenta(s)/equipamento(s) cadastrados (1 posse(s))')).toBeTruthy();
    expect(await estoque.bens()).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('confirmar-importacao'));
    expect(await screen.findByTestId('ok')).toHaveTextContent(/Importação concluída/);
    expect(await estoque.bens()).toHaveLength(1);
    expect((await estoque.funcionarios()).map((f) => f.nome)).toContain('Maria');
  });

  it('com erros, lista por linha e não deixa importar', async () => {
    const { estoque } = await estoqueComCadastros();
    const bytes = await planilha({ Equipamentos: [[...ABAS.equipamentos.colunas], eq({ Nome: 'Serra', Tipo: 'Ferramenta', Controle: 'Individual', 'Onde está': 'Obra' })] });
    await render(<Raiz {...base} usuario={estoque.usuario} estoque={estoque} escolherPlanilha={async () => bytes} />);
    await fireEvent.press(screen.getByTestId('aba-mais'));
    await fireEvent.press(screen.getByTestId('abrir-importar'));
    await fireEvent.press(screen.getByTestId('escolher-planilha'));
    expect(await screen.findByTestId('erro-imp-0')).toHaveTextContent('Equipamentos, linha 2: Em obra: informe Com quem e a Frente de serviço');
    expect(screen.queryByTestId('confirmar-importacao')).toBeNull();
  });
});
