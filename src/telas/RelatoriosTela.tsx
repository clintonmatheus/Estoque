import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { analisarDataBR, formatarDataBR, horaLocal, periodoDoMes, type Periodo } from '../domain/datas';
import type { Funcionario, Item } from '../domain/tipos';
import { relatorioEpi, relatorioBens, relatorioLocados, relatorioGastos, relatorioHistorico, relatorioHtml, relatorioSaldo, type Relatorio } from '../relatorios/relatorios';
import { Botao, Campo, Cartao, Mensagem, Seletor } from './componentes';
import { estilos } from './estilos';

export interface SaidaRelatorio {
  pdf: (html: string, nome: string, paisagem: boolean) => Promise<void>;
  xlsx: (r: Relatorio) => Promise<void>;
}

interface Props { estoque: Estoque; hoje: string; agora: () => string; saida: SaidaRelatorio; versao?: number }

type Formato = 'pdf' | 'xlsx';
type Qual = 'saldo' | 'gastos' | 'historico' | 'equipamentos' | 'locados' | 'epi';

export function RelatoriosTela({ estoque, hoje, agora, saida, versao = 0 }: Props) {
  const mes = periodoDoMes(hoje);
  const [itens, setItens] = useState<Item[]>([]);
  const [deG, setDeG] = useState(formatarDataBR(mes.inicio));
  const [ateG, setAteG] = useState(formatarDataBR(hoje));
  const [itemId, setItemId] = useState<string>();
  const [deH, setDeH] = useState(formatarDataBR(mes.inicio));
  const [ateH, setAteH] = useState(formatarDataBR(hoje));
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [funcEpi, setFuncEpi] = useState<string>();
  const [deE, setDeE] = useState(formatarDataBR(mes.inicio));
  const [ateE, setAteE] = useState(formatarDataBR(hoje));
  const [erro, setErro] = useState<string>();
  const [gerando, setGerando] = useState(false);

  useEffect(() => { void Promise.all([estoque.itens(true), estoque.funcionarios(true)]).then(([i, f]) => { setItens(i); setFuncs(f); }); }, [estoque, versao]);

  const periodo = (de: string, ate: string): Periodo => {
    const p = { inicio: analisarDataBR(de), fim: analisarDataBR(ate) };
    if (p.inicio > p.fim) throw new Error('Período inválido');
    return p;
  };

  async function gerar(qual: Qual, formato: Formato) {
    setErro(undefined);
    try {
      const [movs, todos, locais, funcs, pos] = await Promise.all([
        estoque.movimentos(), estoque.itens(true), estoque.locais(true), estoque.funcionarios(true), estoque.posicao(),
      ]);
      let r: Relatorio;
      if (qual === 'saldo') r = relatorioSaldo(todos, pos, hoje);
      else if (qual === 'equipamentos') r = relatorioBens(await estoque.bens(), await estoque.movimentosBens(), funcs, locais, hoje);
      else if (qual === 'locados') r = relatorioLocados(await estoque.bens(), await estoque.movimentosBens(), locais, hoje);
      else if (qual === 'epi') r = relatorioEpi(movs, todos, funcs, periodo(deE, ateE), funcEpi);
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

  const botoes = (qual: Qual) => (
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
      <Text style={estilos.secao}>Ferramentas e equipamentos</Text>
      <Cartao>
        <Text style={estilos.subtitulo}>Onde está cada ferramenta e equipamento locado, com quem e em qual obra, e as devoluções atrasadas.</Text>
        {botoes('equipamentos')}
      </Cartao>
      <Text style={estilos.secao}>Equipamentos locados</Text>
      <Cartao>
        <Text style={estilos.subtitulo}>Contrato, valor, prazo da locação e peças em obra diferente da cobrada pela locadora.</Text>
        {botoes('locados')}
      </Cartao>
      <Text style={estilos.secao}>Entrega de EPI</Text>
      <Cartao>
        <Text style={estilos.subtitulo}>O que cada funcionário recebeu, com CA, tamanho e data de troca.</Text>
        <Seletor testID="epi-func" rotulo="Funcionário (vazio = todos)" valor={funcEpi} vazio="Todos os funcionários"
          opcoes={funcs.map((f) => ({ id: f.id, titulo: f.nome }))} onEscolher={setFuncEpi} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Campo testID="epi-de" rotulo="De" value={deE} onChangeText={setDeE} style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
          <Campo testID="epi-ate" rotulo="Até" value={ateE} onChangeText={setAteE} style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
        </View>
        {botoes('epi')}
      </Cartao>
    </ScrollView>
  );
}
