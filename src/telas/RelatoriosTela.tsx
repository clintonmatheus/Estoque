import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { analisarDataBR, formatarDataBR, horaLocal, periodoDoMes, type Periodo } from '../domain/datas';
import type { Item } from '../domain/tipos';
import { relatorioGastos, relatorioHistorico, relatorioHtml, relatorioSaldo, type Relatorio } from '../relatorios/relatorios';
import { Botao, Campo, Cartao, Mensagem, Seletor } from './componentes';
import { estilos } from './estilos';

export interface SaidaRelatorio {
  pdf: (html: string, nome: string, paisagem: boolean) => Promise<void>;
  xlsx: (r: Relatorio) => Promise<void>;
}

interface Props { estoque: Estoque; hoje: string; agora: () => string; saida: SaidaRelatorio; versao?: number }

type Formato = 'pdf' | 'xlsx';

export function RelatoriosTela({ estoque, hoje, agora, saida, versao = 0 }: Props) {
  const mes = periodoDoMes(hoje);
  const [itens, setItens] = useState<Item[]>([]);
  const [deG, setDeG] = useState(formatarDataBR(mes.inicio));
  const [ateG, setAteG] = useState(formatarDataBR(hoje));
  const [itemId, setItemId] = useState<string>();
  const [deH, setDeH] = useState(formatarDataBR(mes.inicio));
  const [ateH, setAteH] = useState(formatarDataBR(hoje));
  const [erro, setErro] = useState<string>();
  const [gerando, setGerando] = useState(false);

  useEffect(() => { void estoque.itens(true).then(setItens); }, [estoque, versao]);

  const periodo = (de: string, ate: string): Periodo => {
    const p = { inicio: analisarDataBR(de), fim: analisarDataBR(ate) };
    if (p.inicio > p.fim) throw new Error('Período inválido');
    return p;
  };

  async function gerar(qual: 'saldo' | 'gastos' | 'historico', formato: Formato) {
    setErro(undefined);
    try {
      const [movs, todos, locais, funcs, pos] = await Promise.all([
        estoque.movimentos(), estoque.itens(true), estoque.locais(true), estoque.funcionarios(true), estoque.posicao(),
      ]);
      let r: Relatorio;
      if (qual === 'saldo') r = relatorioSaldo(todos, pos, hoje);
      else if (qual === 'gastos') r = relatorioGastos(movs, todos, locais, pos, periodo(deG, ateG));
      else {
        const it = todos.find((i) => i.id === itemId);
        if (!it) throw new Error('Escolha o item');
        r = relatorioHistorico(it, movs, locais, funcs, pos, periodo(deH, ateH));
      }
      setGerando(true);
      const emitido = `${formatarDataBR(hoje)} às ${horaLocal(agora())} por ${estoque.usuario.nome}`;
      if (formato === 'pdf') await saida.pdf(relatorioHtml(r, emitido), r.arquivo, r.colunas.length > 5);
      else await saida.xlsx(r);
    } catch (e) {
      setErro((e as Error).message || 'Não foi possível gerar o relatório');
    } finally {
      setGerando(false);
    }
  }

  const botoes = (qual: 'saldo' | 'gastos' | 'historico') => (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Botao testID={`${qual}-pdf`} titulo="PDF" secundario desativado={gerando} onPress={() => void gerar(qual, 'pdf')} />
      <Botao testID={`${qual}-xlsx`} titulo="Excel" secundario desativado={gerando} onPress={() => void gerar(qual, 'xlsx')} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Mensagem erro={erro} />
      <Text style={estilos.secao}>Saldo atual</Text>
      <Cartao>
        <Text style={estilos.subtitulo}>Quantidade, custo médio e valor de cada item, com alerta de estoque mínimo.</Text>
        {botoes('saldo')}
      </Cartao>
      <Text style={estilos.secao}>Material por centro de custo</Text>
      <Cartao>
        <Text style={estilos.subtitulo}>Quanto (R$) foi destinado a cada frente de serviço, agrupado por contrato. Devoluções são abatidas.</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Campo testID="gastos-de" rotulo="De" value={deG} onChangeText={setDeG} style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
          <Campo testID="gastos-ate" rotulo="Até" value={ateG} onChangeText={setAteG} style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
        </View>
        {botoes('gastos')}
      </Cartao>
      <Text style={estilos.secao}>Histórico do item</Text>
      <Cartao>
        <Seletor testID="historico-item" rotulo="Item" valor={itemId} opcoes={itens.map((i) => ({ id: i.id, titulo: i.nome }))} onEscolher={setItemId} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Campo testID="historico-de" rotulo="De" value={deH} onChangeText={setDeH} style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
          <Campo testID="historico-ate" rotulo="Até" value={ateH} onChangeText={setAteH} style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
        </View>
        {botoes('historico')}
      </Cartao>
    </ScrollView>
  );
}
