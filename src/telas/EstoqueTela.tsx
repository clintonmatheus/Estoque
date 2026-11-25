import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { categoriaDoItem } from '../domain/categorias';
import { formatarDataBR } from '../domain/datas';
import { ordenarMovimentos, type Posicao } from '../domain/estoque';
import type { LinhaSaldo } from '../domain/filtros';
import { formatarMoeda, formatarNumero, formatarQuantidade } from '../domain/formato';
import type { Item, Local, Movimento } from '../domain/tipos';
import type { Estoque } from '../dados/estoque';
import { NOME_TIPO } from '../relatorios/relatorios';
import { ListaSaldos } from './ListaSaldos';
import { cores, estilos } from './estilos';

interface Props { estoque: Estoque; hoje: string; versao?: number }

export function EstoqueTela({ estoque, hoje, versao = 0 }: Props) {
  const [itens, setItens] = useState<Item[]>([]);
  const [posicao, setPosicao] = useState<Posicao>();
  const [movs, setMovs] = useState<Movimento[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [i, p, m, l] = await Promise.all([estoque.itens(false, 'material'), estoque.posicao(), estoque.movimentos(), estoque.locais(true)]);
      if (ativo) { setItens(i); setPosicao(p); setMovs(m); setLocais(l); }
    })();
    return () => { ativo = false; };
  }, [estoque, versao]);

  const linhas = useMemo<LinhaSaldo[]>(() => {
    const ultimaSaida = new Map<string, string>();
    for (const m of movs) {
      if (m.cancelado || m.tipo !== 'saida') continue;
      if ((ultimaSaida.get(m.itemId) ?? '') < m.data) ultimaSaida.set(m.itemId, m.data);
    }
    return itens.map((i) => ({
      itemId: i.id, nome: i.nome, unidade: i.unidade, embalagem: i.embalagem, estoqueMinimo: i.estoqueMinimo,
      saldo: posicao?.itens[i.id]?.quantidade ?? 0, valor: posicao?.itens[i.id]?.valor ?? 0,
      categoria: categoriaDoItem(i), ultimaSaida: ultimaSaida.get(i.id),
    }));
  }, [itens, posicao, movs]);

  const nomeLocal = (id?: string) => locais.find((l) => l.id === id)?.nome ?? '';

  const detalhe = (itemId: string) => {
    const i = itens.find((x) => x.id === itemId);
    const s = posicao?.itens[itemId];
    if (!i) return null;
    const ultimos = ordenarMovimentos(movs.filter((m) => m.itemId === itemId && !m.cancelado)).reverse().slice(0, 8);
    return (
      <View style={{ gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: cores.borda }}>
        <Text style={estilos.rotulo}>Lotes (sai primeiro o mais antigo)</Text>
        {s?.lotes.length ? s.lotes.map((l, k) => (
          <Text key={k} style={estilos.subtitulo}>{`${formatarQuantidade(i, l.quantidade)} a ${formatarMoeda(l.custo)}`}</Text>
        )) : <Text style={estilos.subtitulo}>Sem saldo.</Text>}
        <Text style={[estilos.rotulo, { marginTop: 6 }]}>Últimos lançamentos</Text>
        {ultimos.length ? ultimos.map((m) => (
          <Text key={m.id} style={estilos.subtitulo}>
            {`${formatarDataBR(m.data)} · ${NOME_TIPO[m.tipo]} · ${formatarNumero(m.quantidade)} ${i.unidade}`}
            {m.localId ? ` · ${nomeLocal(m.localId)}` : ''}{m.localDestinoId ? ` → ${nomeLocal(m.localDestinoId)}` : ''}
          </Text>
        )) : <Text style={estilos.subtitulo}>Nenhum lançamento.</Text>}
      </View>
    );
  };

  const topo = posicao?.problemas.length ? (
    <View style={[estilos.card, { backgroundColor: cores.erroClaro }]}>
      <Text testID="alerta-saldo" style={{ color: cores.erro, fontWeight: '700' }}>
        {`Atenção: ${posicao.problemas.length} lançamento(s) ficaram sem saldo suficiente.`}
      </Text>
      <Text style={estilos.subtitulo}>Isso acontece quando dois aparelhos lançam sem internet ao mesmo tempo. Corrija no Histórico ou faça um inventário.</Text>
    </View>
  ) : undefined;

  return <ListaSaldos linhas={linhas} hoje={hoje} completo detalhe={detalhe} topo={topo} vazio="Nenhum item cadastrado. Vá em Mais → Cadastros." />;
}
