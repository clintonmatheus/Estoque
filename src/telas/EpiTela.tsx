import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { formatarDataBR } from '../domain/datas';
import { epiParaTrocar, type EpiParaTrocar } from '../domain/ferramentas';
import type { Funcionario, Item, Movimento } from '../domain/tipos';
import { Cartao, Chips, Seletor } from './componentes';
import { cores, estilos } from './estilos';

type Filtro = 'trocas' | 'fichas';
const JANELA_DIAS = 30;

interface Props { estoque: Estoque; hoje: string; versao?: number }

/** EPIs com troca vencida ou próxima, e a ficha de entregas de cada funcionário. */
export function EpiTela({ estoque, hoje, versao = 0 }: Props) {
  const [movs, setMovs] = useState<Movimento[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('trocas');
  const [funcionarioId, setFuncionarioId] = useState<string>();

  useEffect(() => {
    void Promise.all([estoque.movimentos(), estoque.itens(true), estoque.funcionarios(true)]).then(([m, i, f]) => { setMovs(m); setItens(i); setFuncs(f); });
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

  return (
    <FlatList
      data={linhas}
      keyExtractor={(x) => x.chave}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={estilos.conteudo}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Chips prefixo="epi" valor={filtro} onMudar={setFiltro} opcoes={[
            { id: 'trocas', titulo: `Trocas (${trocas.length})` }, { id: 'fichas', titulo: 'Ficha do funcionário' },
          ]} />
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
