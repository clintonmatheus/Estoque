import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { formatarDataBR } from '../domain/datas';
import { ordenarMovimentos, type Posicao } from '../domain/estoque';
import { formatarMoeda, formatarNumero, formatarQuantidade } from '../domain/formato';
import type { Item, Local, Movimento } from '../domain/tipos';
import { NOME_TIPO } from '../relatorios/relatorios';
import { Cartao, Chips, filtrar } from './componentes';
import { cores, estilos } from './estilos';

interface Props { estoque: Estoque; versao?: number }

export function EstoqueTela({ estoque, versao = 0 }: Props) {
  const [itens, setItens] = useState<Item[]>([]);
  const [posicao, setPosicao] = useState<Posicao>();
  const [movs, setMovs] = useState<Movimento[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'minimo'>('todos');
  const [aberto, setAberto] = useState<string>();

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [i, p, m, l] = await Promise.all([estoque.itens(), estoque.posicao(), estoque.movimentos(), estoque.locais(true)]);
      if (ativo) { setItens(i); setPosicao(p); setMovs(m); setLocais(l); }
    })();
    return () => { ativo = false; };
  }, [estoque, versao]);

  const saldo = (id: string) => posicao?.itens[id]?.quantidade ?? 0;
  const abaixo = (i: Item) => i.estoqueMinimo > 0 && saldo(i.id) <= i.estoqueMinimo;
  const lista = useMemo(
    () => filtrar(itens, busca, (i) => i.nome).filter((i) => filtro === 'todos' || abaixo(i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itens, busca, filtro, posicao],
  );
  const total = itens.reduce((t, i) => t + (posicao?.itens[i.id]?.valor ?? 0), 0);
  const nAbaixo = itens.filter(abaixo).length;
  const nomeLocal = (id?: string) => locais.find((l) => l.id === id)?.nome ?? '';

  return (
    <FlatList
      data={lista}
      keyExtractor={(i) => i.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={estilos.conteudo}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Cartao gap={2}>
            <Text style={estilos.rotulo}>Valor em estoque</Text>
            <Text testID="valor-total" style={[estilos.titulo, { fontSize: 22 }]}>{formatarMoeda(total)}</Text>
            <Text style={estilos.subtitulo}>{`${itens.length} itens · ${nAbaixo} abaixo do mínimo`}</Text>
          </Cartao>
          {!!posicao?.problemas.length && (
            <Cartao>
              <Text testID="alerta-saldo" style={{ color: cores.erro, fontWeight: '700' }}>
                {`Atenção: ${posicao.problemas.length} lançamento(s) ficaram sem saldo suficiente.`}
              </Text>
              <Text style={estilos.subtitulo}>Isso acontece quando dois aparelhos lançam sem internet ao mesmo tempo. Corrija no Histórico ou faça um inventário.</Text>
            </Cartao>
          )}
          <TextInput testID="busca" style={estilos.entrada} placeholder="Buscar item…" value={busca} onChangeText={setBusca} />
          <Chips prefixo="filtro" valor={filtro} onMudar={setFiltro}
            opcoes={[{ id: 'todos', titulo: 'Todos' }, { id: 'minimo', titulo: `Abaixo do mínimo (${nAbaixo})` }]} />
        </View>
      }
      ListEmptyComponent={<Text style={estilos.subtitulo}>{itens.length ? 'Nenhum item encontrado.' : 'Nenhum item cadastrado. Vá em Mais → Cadastros.'}</Text>}
      renderItem={({ item: i }) => {
        const s = posicao?.itens[i.id];
        const q = s?.quantidade ?? 0;
        const doItem = aberto === i.id ? ordenarMovimentos(movs.filter((m) => m.itemId === i.id && !m.cancelado)).reverse().slice(0, 10) : [];
        return (
          <Pressable testID={`item-${i.id}`} onPress={() => setAberto(aberto === i.id ? undefined : i.id)} style={estilos.card}>
            <View style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.titulo}>{i.nome}</Text>
                <Text testID={`saldo-${i.id}`} style={[estilos.subtitulo, abaixo(i) && { color: cores.aviso, fontWeight: '700' }]}>
                  {formatarQuantidade(i, q)}{abaixo(i) ? ` · mínimo ${formatarNumero(i.estoqueMinimo)}` : ''}
                </Text>
              </View>
              <Text style={estilos.valor}>{formatarMoeda(s?.valor ?? 0)}</Text>
            </View>
            {aberto === i.id && (
              <View style={{ gap: 6, marginTop: 6 }}>
                <Text style={estilos.rotulo}>Lotes (PEPS — sai primeiro o mais antigo)</Text>
                {(s?.lotes.length ? s.lotes : []).map((l, k) => (
                  <Text key={k} style={estilos.subtitulo}>{`${formatarQuantidade(i, l.quantidade)} a ${formatarMoeda(l.custo)}`}</Text>
                ))}
                {!s?.lotes.length && <Text style={estilos.subtitulo}>Sem saldo.</Text>}
                <Text style={estilos.rotulo}>Últimos lançamentos</Text>
                {doItem.map((m) => (
                  <Text key={m.id} style={estilos.subtitulo}>
                    {`${formatarDataBR(m.data)} · ${NOME_TIPO[m.tipo]} · ${formatarNumero(m.quantidade)} ${i.unidade}`}
                    {m.localId ? ` · ${nomeLocal(m.localId)}` : ''}{m.localDestinoId ? ` → ${nomeLocal(m.localDestinoId)}` : ''}
                  </Text>
                ))}
                {!doItem.length && <Text style={estilos.subtitulo}>Nenhum lançamento.</Text>}
              </View>
            )}
          </Pressable>
        );
      }}
    />
  );
}
