import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { abaixoDoMinimo, aplicarFiltro, opcoesDeFiltro, type Filtro, type LinhaSaldo } from '../domain/filtros';
import { formatarMoeda, formatarNumero, formatarQuantidade } from '../domain/formato';
import { filtrar } from './componentes';
import { cores, estilos } from './estilos';

interface Props {
  linhas: LinhaSaldo[];
  hoje: string;
  /** Almoxarife/administrador: mostra R$ e o filtro de parados. */
  completo: boolean;
  /** Conteúdo exibido ao tocar no item (lotes, últimos lançamentos). */
  detalhe?: (itemId: string) => ReactNode;
  topo?: ReactNode;
  vazio: string;
}

/** Lista do estoque: nome à esquerda, saldo em destaque à direita, busca e filtros prontos. */
export function ListaSaldos({ linhas, hoje, completo, detalhe, topo, vazio }: Props) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [aberto, setAberto] = useState<string>();
  const opcoes = useMemo(() => opcoesDeFiltro(linhas, hoje, completo), [linhas, hoje, completo]);
  const lista = useMemo(() => filtrar(aplicarFiltro(linhas, filtro, hoje), busca, (l) => l.nome), [linhas, filtro, hoje, busca]);
  const zerados = opcoes.find((o) => o.id === 'zerados')?.quantidade ?? 0;
  const minimo = opcoes.find((o) => o.id === 'minimo')?.quantidade ?? 0;
  const total = linhas.reduce((t, l) => t + (l.valor ?? 0), 0);

  const resumo = (titulo: string, valor: string, id: Filtro, alerta = false) => (
    <Pressable testID={`resumo-${id}`} onPress={() => setFiltro(filtro === id ? 'todos' : id)}
      style={[estilos.card, { flex: 1, paddingVertical: 10, gap: 0 }, filtro === id && { borderWidth: 1.5, borderColor: cores.primaria }]}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: cores.suave, textTransform: 'uppercase', letterSpacing: 0.3 }}>{titulo}</Text>
      <Text style={{ fontSize: 20, fontWeight: '800', color: alerta && valor !== '0' ? cores.aviso : cores.texto }}>{valor}</Text>
    </Pressable>
  );

  return (
    <FlatList
      data={lista}
      keyExtractor={(l) => l.itemId}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 24 }}
      ListHeaderComponent={
        <View style={{ gap: 12, padding: 16, paddingBottom: 8 }}>
          {topo}
          <View style={[estilos.entrada, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 0 }]}>
            <Ionicons name="search" size={18} color={cores.suave} />
            <TextInput testID="busca" style={{ flex: 1, fontSize: 16, paddingVertical: 11, color: cores.texto }}
              placeholder="Buscar item…" placeholderTextColor={cores.suave} value={busca} onChangeText={setBusca} />
            {!!busca && <Pressable onPress={() => setBusca('')} hitSlop={10}><Ionicons name="close-circle" size={18} color={cores.suave} /></Pressable>}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {resumo('Itens', String(linhas.length), 'todos')}
            {resumo('Zerados', String(zerados), 'zerados', true)}
            {resumo('Abaixo mín.', String(minimo), 'minimo', true)}
          </View>
          {completo && <Text testID="valor-total" style={estilos.subtitulo}>{`Valor em estoque: ${formatarMoeda(total)}`}</Text>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {opcoes.map((o) => (
              <Pressable key={o.id} testID={`filtro-${o.id}`} onPress={() => setFiltro(o.id)} style={[estilos.chip, filtro === o.id && estilos.chipAtivo]}>
                <Text style={filtro === o.id ? estilos.chipTextoAtivo : estilos.chipTexto}>{`${o.titulo} (${o.quantidade})`}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 4 }}>
            <Text style={estilos.secao}>{`Item (${lista.length})`}</Text>
            <Text style={estilos.secao}>Saldo</Text>
          </View>
        </View>
      }
      ListEmptyComponent={<Text style={[estilos.subtitulo, { paddingHorizontal: 16 }]}>{linhas.length ? 'Nenhum item neste filtro.' : vazio}</Text>}
      renderItem={({ item: l, index }) => {
        const alerta = abaixoDoMinimo(l);
        const zerado = l.saldo <= 0;
        const emb = l.embalagem && l.saldo >= l.embalagem.fator ? formatarQuantidade(l, l.saldo).replace(/^[^(]*\(|\)$/g, '') : undefined;
        const meta = [l.categoria, emb, completo && l.valor !== undefined ? formatarMoeda(l.valor) : undefined].filter(Boolean).join(' · ');
        return (
          <Pressable testID={`item-${l.itemId}`} disabled={!detalhe} onPress={() => setAberto(aberto === l.itemId ? undefined : l.itemId)}
            style={{
              backgroundColor: cores.card, marginHorizontal: 16, paddingHorizontal: 14, paddingVertical: 12,
              borderTopLeftRadius: index === 0 ? 14 : 0, borderTopRightRadius: index === 0 ? 14 : 0,
              borderBottomLeftRadius: index === lista.length - 1 ? 14 : 0, borderBottomRightRadius: index === lista.length - 1 ? 14 : 0,
              borderTopWidth: index === 0 ? 0 : 1, borderTopColor: cores.borda,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: cores.texto }} numberOfLines={2}>{l.nome}</Text>
                <Text style={{ fontSize: 12.5, color: cores.suave, marginTop: 2 }} numberOfLines={1}>{meta}</Text>
                {alerta && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <Ionicons name="warning" size={12} color={cores.aviso} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: cores.aviso }}>{`Abaixo do mínimo (${formatarNumero(l.estoqueMinimo)})`}</Text>
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', minWidth: 64 }}>
                <Text testID={`saldo-${l.itemId}`} style={{ fontSize: 22, fontWeight: '800', color: zerado || alerta ? cores.aviso : cores.texto }}>
                  {formatarNumero(l.saldo)}
                </Text>
                <Text style={{ fontSize: 12, color: cores.suave }}>{l.unidade}</Text>
              </View>
            </View>
            {aberto === l.itemId && detalhe?.(l.itemId)}
          </Pressable>
        );
      }}
    />
  );
}
