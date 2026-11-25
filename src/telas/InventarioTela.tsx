import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { analisarDataBR, formatarDataBR } from '../domain/datas';
import type { Posicao } from '../domain/estoque';
import { formatarMoeda, formatarQuantidade, lerNumero } from '../domain/formato';
import type { Item } from '../domain/tipos';
import { controlaTamanho, normalizarTamanho, saldosPorTamanho } from '../domain/epi';
import { Botao, Campo, Cartao, filtrar, Mensagem } from './componentes';
import { cores, estilos } from './estilos';

interface Props { estoque: Estoque; hoje: string; versao?: number; onConcluido?: () => void; /** Conta só os itens de EPI (sem isto, só os materiais). */ epi?: boolean }

/** Contagem física: digita o que foi contado; o app gera ajustes para as diferenças. */
export function InventarioTela({ estoque, hoje, versao = 0, onConcluido, epi = false }: Props) {
  const [itens, setItens] = useState<Item[]>([]);
  const [posicao, setPosicao] = useState<Posicao>();
  const [porTamanho, setPorTamanho] = useState<Map<string, Map<string, number>>>(new Map());
  const [contado, setContado] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState('');
  const [data, setData] = useState(formatarDataBR(hoje));
  const [revisando, setRevisando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState<string>();

  useEffect(() => {
    void Promise.all([estoque.itens(false, epi ? 'epi' : 'material'), estoque.posicao(), estoque.movimentos()]).then(([i, p, m]) => {
      setItens(i); setPosicao(p); setPorTamanho(saldosPorTamanho(m, new Set(i.filter(controlaTamanho).map((x) => x.id))));
    });
  }, [estoque, versao, epi]);

  const saldo = (id: string) => posicao?.itens[id]?.quantidade ?? 0;
  /** Cada campo de contagem: o item inteiro ou um tamanho dele (EPI com tamanhos). */
  const campos = useMemo(() => itens.flatMap((i) => (controlaTamanho(i)
    ? i.tamanhos!.map((t) => ({ chave: `${i.id}|${normalizarTamanho(t)}`, item: i, tamanho: normalizarTamanho(t), sistema: porTamanho.get(i.id)?.get(normalizarTamanho(t)) ?? 0 }))
    : [{ chave: i.id, item: i, tamanho: undefined as string | undefined, sistema: posicao?.itens[i.id]?.quantidade ?? 0 }])), [itens, porTamanho, posicao]);
  const custo = (i: Item) => {
    const s = posicao?.itens[i.id];
    return s && s.quantidade > 0 ? s.valor / s.quantidade : s?.ultimoCusto || i.custoReferencia || 0;
  };
  const diferencas = useMemo(() => campos.flatMap((k) => {
    const c = lerNumero(contado[k.chave] ?? '');
    if (c === undefined) return [];
    const d = Math.round((c - k.sistema) * 1000) / 1000;
    return d ? [{ ...k, contado: c, diferenca: d }] : [];
  }), [campos, contado]);
  const preenchidos = Object.values(contado).filter((v) => v.trim()).length;

  async function confirmar() {
    setErro(undefined);
    try {
      const contagens = campos.flatMap((k) => {
        const t = contado[k.chave] ?? '';
        if (!t.trim()) return [];
        const c = lerNumero(t);
        if (c === undefined || c < 0) throw new Error(`Quantidade inválida em ${k.item.nome}`);
        return [{ itemId: k.item.id, contado: c, ...(k.tamanho ? { tamanho: k.tamanho } : {}) }];
      });
      const aj = await estoque.registrarInventario(analisarDataBR(data), contagens);
      setOk(aj.length ? `Inventário registrado: ${aj.length} ajuste(s).` : 'Inventário conferido: nenhuma diferença.');
      setContado({}); setRevisando(false);
      setPosicao(await estoque.posicao());
      setPorTamanho(saldosPorTamanho(await estoque.movimentos(), new Set(itens.filter(controlaTamanho).map((x) => x.id))));
      onConcluido?.();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (revisando) {
    const total = diferencas.reduce((t, d) => t + d.diferenca * custo(d.item), 0);
    return (
      <FlatList data={diferencas} keyExtractor={(d) => d.chave} contentContainerStyle={estilos.conteudo}
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
            <Text style={estilos.titulo}>{d.tamanho ? `${d.item.nome} · tamanho ${d.tamanho}` : d.item.nome}</Text>
            <Text style={[estilos.subtitulo, { color: d.diferenca < 0 ? cores.erro : cores.ok }]}>
              {`Sistema ${formatarQuantidade(d.item, d.sistema)} → contado ${formatarQuantidade(d.item, d.contado)} (${d.diferenca > 0 ? '+' : ''}${formatarQuantidade(d.item, d.diferenca)})`}
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
      data={filtrar(campos, busca, (k) => k.item.nome)}
      keyExtractor={(k) => k.chave}
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
      renderItem={({ item: k }) => (
        <View style={[estilos.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.titulo}>{k.tamanho ? `${k.item.nome} · tamanho ${k.tamanho}` : k.item.nome}</Text>
            <Text style={estilos.subtitulo}>{`Sistema: ${formatarQuantidade(k.item, k.sistema)}`}{k.tamanho && (porTamanho.get(k.item.id)?.get('') ?? 0) ? ` · sem tamanho: ${porTamanho.get(k.item.id)?.get('')} (zera ao contar)` : ''}</Text>
          </View>
          <TextInput testID={k.tamanho ? `contado-${k.item.id}-${k.tamanho}` : `contado-${k.item.id}`} style={[estilos.entrada, { width: 90, textAlign: 'center' }]} placeholder={k.item.unidade}
            keyboardType="decimal-pad" value={contado[k.chave] ?? ''} onChangeText={(v) => setContado((c) => ({ ...c, [k.chave]: v }))} />
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
