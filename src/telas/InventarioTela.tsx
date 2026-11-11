import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { analisarDataBR, formatarDataBR } from '../domain/datas';
import type { Posicao } from '../domain/estoque';
import { formatarMoeda, formatarQuantidade, lerNumero } from '../domain/formato';
import type { Item } from '../domain/tipos';
import { Botao, Campo, Cartao, filtrar, Mensagem } from './componentes';
import { cores, estilos } from './estilos';

interface Props { estoque: Estoque; hoje: string; versao?: number; onConcluido?: () => void }

/** Contagem física: digita o que foi contado; o app gera ajustes para as diferenças. */
export function InventarioTela({ estoque, hoje, versao = 0, onConcluido }: Props) {
  const [itens, setItens] = useState<Item[]>([]);
  const [posicao, setPosicao] = useState<Posicao>();
  const [contado, setContado] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState('');
  const [data, setData] = useState(formatarDataBR(hoje));
  const [revisando, setRevisando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState<string>();

  useEffect(() => {
    void Promise.all([estoque.itens(), estoque.posicao()]).then(([i, p]) => { setItens(i); setPosicao(p); });
  }, [estoque, versao]);

  const saldo = (id: string) => posicao?.itens[id]?.quantidade ?? 0;
  const custo = (i: Item) => {
    const s = posicao?.itens[i.id];
    return s && s.quantidade > 0 ? s.valor / s.quantidade : s?.ultimoCusto || i.custoReferencia || 0;
  };
  const diferencas = useMemo(() => itens.flatMap((i) => {
    const c = lerNumero(contado[i.id] ?? '');
    if (c === undefined) return [];
    const d = Math.round((c - saldo(i.id)) * 1000) / 1000;
    return d ? [{ item: i, contado: c, diferenca: d }] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [itens, contado, posicao]);
  const preenchidos = Object.values(contado).filter((v) => v.trim()).length;

  async function confirmar() {
    setErro(undefined);
    try {
      const contagens = itens.flatMap((i) => {
        const t = contado[i.id] ?? '';
        if (!t.trim()) return [];
        const c = lerNumero(t);
        if (c === undefined || c < 0) throw new Error(`Quantidade inválida em ${i.nome}`);
        return [{ itemId: i.id, contado: c }];
      });
      const aj = await estoque.registrarInventario(analisarDataBR(data), contagens);
      setOk(aj.length ? `Inventário registrado: ${aj.length} ajuste(s).` : 'Inventário conferido: nenhuma diferença.');
      setContado({}); setRevisando(false);
      setPosicao(await estoque.posicao());
      onConcluido?.();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (revisando) {
    const total = diferencas.reduce((t, d) => t + d.diferenca * custo(d.item), 0);
    return (
      <FlatList data={diferencas} keyExtractor={(d) => d.item.id} contentContainerStyle={estilos.conteudo}
        ListHeaderComponent={
          <Cartao>
            <Text style={estilos.titulo}>{`Conferência de ${data}`}</Text>
            <Text style={estilos.subtitulo}>{`${preenchidos} itens contados · ${diferencas.length} com diferença`}</Text>
            <Text testID="diferenca-total" style={estilos.valor}>{`Diferença estimada: ${formatarMoeda(total)}`}</Text>
          </Cartao>
        }
        ListEmptyComponent={<Text style={estilos.subtitulo}>Nenhuma diferença: o contado bate com o sistema.</Text>}
        renderItem={({ item: d }) => (
          <View style={estilos.card}>
            <Text style={estilos.titulo}>{d.item.nome}</Text>
            <Text style={[estilos.subtitulo, { color: d.diferenca < 0 ? cores.erro : cores.ok }]}>
              {`Sistema ${formatarQuantidade(d.item, saldo(d.item.id))} → contado ${formatarQuantidade(d.item, d.contado)} (${d.diferenca > 0 ? '+' : ''}${formatarQuantidade(d.item, d.diferenca)})`}
            </Text>
          </View>
        )}
        ListFooterComponent={
          <View style={{ gap: 8, marginTop: 8 }}>
            <Mensagem erro={erro} />
            <Botao testID="confirmar-inventario" titulo="Confirmar e gerar ajustes" onPress={() => void confirmar()} />
            <Botao titulo="Voltar à contagem" secundario onPress={() => setRevisando(false)} />
          </View>
        } />
    );
  }

  return (
    <FlatList
      data={filtrar(itens, busca, (i) => i.nome)}
      keyExtractor={(i) => i.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={estilos.conteudo}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Cartao>
            <Text style={estilos.subtitulo}>
              Conte o material no galpão e digite a quantidade encontrada. Itens em branco não são alterados. Na primeira contagem, o valor usa o custo da planilha.
            </Text>
            <Campo testID="data-inventario" rotulo="Data da contagem" value={data} onChangeText={setData} keyboardType="numbers-and-punctuation" />
          </Cartao>
          <TextInput testID="busca" style={estilos.entrada} placeholder="Buscar item…" value={busca} onChangeText={setBusca} />
          <Mensagem ok={ok} />
        </View>
      }
      renderItem={({ item: i }) => (
        <View style={[estilos.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.titulo}>{i.nome}</Text>
            <Text style={estilos.subtitulo}>{`Sistema: ${formatarQuantidade(i, saldo(i.id))}`}</Text>
          </View>
          <TextInput testID={`contado-${i.id}`} style={[estilos.entrada, { width: 90, textAlign: 'center' }]} placeholder={i.unidade}
            keyboardType="decimal-pad" value={contado[i.id] ?? ''} onChangeText={(v) => setContado((c) => ({ ...c, [i.id]: v }))} />
        </View>
      )}
      ListFooterComponent={
        <View style={{ marginTop: 8 }}>
          <Botao testID="revisar-inventario" titulo={`Revisar diferenças (${preenchidos} contados)`} desativado={!preenchidos} onPress={() => { setOk(undefined); setRevisando(true); }} />
        </View>
      }
    />
  );
}
