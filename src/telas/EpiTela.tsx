import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { formatarDataBR } from '../domain/datas';
import { formatarQuantidade } from '../domain/formato';
import type { Posicao } from '../domain/estoque';
import { epiParaTrocar, type EpiParaTrocar } from '../domain/epi';
import type { Funcionario, Item, Movimento } from '../domain/tipos';
import type { ServicoFotos } from '../fotos/servico';
import { Cartao, Chips, Seletor } from './componentes';
import { InventarioTela } from './InventarioTela';
import { LancamentoTela } from './LancamentoTela';
import { cores, estilos } from './estilos';

type Filtro = 'entregar' | 'comprar' | 'trocas' | 'fichas' | 'saldo' | 'inventario';
const JANELA_DIAS = 30;

interface Props { estoque: Estoque; hoje: string; servicoFotos: ServicoFotos; versao?: number; onAlterou?: () => void }

/** EPIs com troca vencida ou próxima, e a ficha de entregas de cada funcionário. */
export function EpiTela({ estoque, hoje, servicoFotos, versao = 0, onAlterou }: Props) {
  const [movs, setMovs] = useState<Movimento[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('entregar');
  const [funcionarioId, setFuncionarioId] = useState<string>();
  const [posicao, setPosicao] = useState<Posicao>();

  useEffect(() => {
    void Promise.all([estoque.movimentos(), estoque.itens(true, 'epi'), estoque.funcionarios(true, 'epi'), estoque.posicao()])
      .then(([m, i, f, p]) => { setMovs(m); setItens(i); setFuncs(f); setPosicao(p); });
  }, [estoque, versao]);

  const nomeItem = (id: string) => itens.find((i) => i.id === id)?.nome ?? 'Item removido';
  const nomeFunc = (id?: string) => funcs.find((f) => f.id === id)?.nome ?? '—';

  const trocas = useMemo(() => epiParaTrocar(movs, hoje, JANELA_DIAS).filter((x) => funcs.find((f) => f.id === x.movimento.funcionarioId)?.ativo !== false),
    [movs, hoje, funcs]);
  const ficha = useMemo(() => movs
    .filter((m) => m.tipo === 'epi' && !m.cancelado && m.funcionarioId === funcionarioId)
    .sort((a, b) => b.data.localeCompare(a.data) || b.criado.em.localeCompare(a.criado.em)), [movs, funcionarioId]);

  const linhas: { chave: string; m: Movimento; t?: EpiParaTrocar }[] = filtro === 'trocas'
    ? trocas.map((t) => ({ chave: t.movimento.id, m: t.movimento, t }))
    : ficha.map((m) => ({ chave: m.id, m }));

  const abas = (
    <Chips prefixo="epi" valor={filtro} onMudar={setFiltro} opcoes={[
      { id: 'entregar', titulo: 'Entregar' }, { id: 'trocas', titulo: `Trocas (${trocas.length})` }, { id: 'fichas', titulo: 'Ficha do funcionário' },
      { id: 'saldo', titulo: 'Estoque de EPI' }, { id: 'comprar', titulo: 'Compra' }, { id: 'inventario', titulo: 'Inventário' },
    ]} />
  );
  if (filtro === 'entregar' || filtro === 'comprar') {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>{abas}</View>
        <LancamentoTela key={filtro} estoque={estoque} tipo={filtro === 'entregar' ? 'epi' : 'entrada'} epi hoje={hoje} servicoFotos={servicoFotos} versao={versao} onSalvo={onAlterou} />
      </View>
    );
  }
  if (filtro === 'inventario') {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>{abas}</View>
        <InventarioTela estoque={estoque} hoje={hoje} versao={versao} onConcluido={onAlterou} epi />
      </View>
    );
  }
  if (filtro === 'saldo') {
    return (
      <FlatList
        data={itens.filter((i) => i.ativo)}
        keyExtractor={(i) => i.id}
        contentContainerStyle={estilos.conteudo}
        ListHeaderComponent={<View style={{ gap: 12 }}>{abas}</View>}
        ListEmptyComponent={<Text style={estilos.subtitulo}>Nenhum EPI cadastrado. Cadastre em Mais → Cadastros → Itens de EPI ou importe a planilha.</Text>}
        renderItem={({ item: i }) => {
          const saldo = posicao?.itens[i.id]?.quantidade ?? 0;
          const baixo = i.estoqueMinimo > 0 && saldo <= i.estoqueMinimo;
          return (
            <Cartao gap={2}>
              <View style={estilos.linha}>
                <Text style={[estilos.titulo, { flex: 1 }]}>{i.nome}</Text>
                <Text testID={`saldo-epi-${i.id}`} style={{ fontWeight: '700', color: baixo ? cores.erro : cores.texto }}>{formatarQuantidade(i, saldo)}</Text>
              </View>
              <Text style={estilos.subtitulo}>{[i.ca && `CA ${i.ca}`, i.vidaUtilDias && `troca a cada ${i.vidaUtilDias} dias`, baixo && 'estoque baixo'].filter(Boolean).join(' · ') || ' '}</Text>
            </Cartao>
          );
        }}
      />
    );
  }

  return (
    <FlatList
      data={linhas}
      keyExtractor={(x) => x.chave}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={estilos.conteudo}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          {abas}
          {filtro === 'trocas' && <Text style={estilos.subtitulo}>{`EPIs vencidos ou que vencem em até ${JANELA_DIAS} dias (considera só a última entrega de cada item a cada funcionário).`}</Text>}
          {filtro === 'fichas' && (
            <Seletor testID="epi-funcionario" rotulo="Funcionário" valor={funcionarioId} opcoes={funcs.filter((f) => f.ativo).map((f) => ({ id: f.id, titulo: f.nome }))} onEscolher={setFuncionarioId} />
          )}
        </View>
      }
      ListEmptyComponent={<Text style={estilos.subtitulo}>
        {filtro === 'trocas' ? 'Nenhum EPI para trocar nos próximos dias.' : funcionarioId ? 'Nenhuma entrega registrada.' : 'Escolha um funcionário.'}
      </Text>}
      renderItem={({ item: { m, t } }) => (
        <Cartao gap={2}>
          <View style={estilos.linha}>
            <Text style={[estilos.titulo, { flex: 1 }]}>{filtro === 'trocas' ? nomeFunc(m.funcionarioId) : nomeItem(m.itemId)}</Text>
            {t && (
              <Text testID={`epi-${m.id}`} style={{ fontWeight: '700', color: t.situacao === 'vencido' ? cores.erro : cores.aviso }}>
                {t.situacao === 'vencido' ? `Vencido há ${-t.dias} d` : t.dias === 0 ? 'Vence hoje' : `Vence em ${t.dias} d`}
              </Text>
            )}
          </View>
          <Text style={estilos.subtitulo}>
            {[filtro === 'trocas' ? nomeItem(m.itemId) : formatarDataBR(m.data), `${m.quantidade} un.`, m.ca && `CA ${m.ca}`, m.tamanho && `tam. ${m.tamanho}`,
              m.validade && `trocar em ${formatarDataBR(m.validade)}`].filter(Boolean).join(' · ')}
          </Text>
          {filtro === 'trocas' && <Text style={estilos.subtitulo}>{`Entregue em ${formatarDataBR(m.data)}`}</Text>}
        </Cartao>
      )}
    />
  );
}
