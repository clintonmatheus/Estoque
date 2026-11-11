import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { analisarDataBR, formatarDataBR, horaLocal } from '../domain/datas';
import type { Posicao } from '../domain/estoque';
import { formatarMoeda, formatarQuantidade, lerNumero } from '../domain/formato';
import type { Anexo, Autoria, Funcionario, Item, Local, Movimento, TipoMovimento } from '../domain/tipos';
import { NOME_TIPO } from '../relatorios/relatorios';
import { Botao, Campo, Cartao, Chips, Mensagem, Seletor } from './componentes';
import { cores, estilos } from './estilos';

interface Props { estoque: Estoque; versao?: number; onAlterou?: () => void }

interface Grupo { id: string; tipo: TipoMovimento; data: string; criado: Autoria; linhas: Movimento[] }

type Filtro = 'todos' | TipoMovimento;
const quando = (a: Autoria) => `${a.nome} em ${formatarDataBR(a.em.slice(0, 10))} às ${horaLocal(a.em)}`;

export function HistoricoTela({ estoque, versao = 0, onAlterou }: Props) {
  const [movs, setMovs] = useState<Movimento[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [posicao, setPosicao] = useState<Posicao>();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [limite, setLimite] = useState(50);
  const [aberto, setAberto] = useState<string>();
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [m, i, l, f, p] = await Promise.all([estoque.movimentos(), estoque.itens(true), estoque.locais(true), estoque.funcionarios(true), estoque.posicao()]);
      if (ativo) { setMovs(m); setItens(i); setLocais(l); setFuncs(f); setPosicao(p); }
    })();
    return () => { ativo = false; };
  }, [estoque, versao, recarregar]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Grupo>();
    for (const m of movs) {
      const g = mapa.get(m.grupo) ?? { id: m.grupo, tipo: m.tipo, data: m.data, criado: m.criado, linhas: [] };
      g.linhas.push(m);
      mapa.set(m.grupo, g);
    }
    return [...mapa.values()]
      .filter((g) => filtro === 'todos' || g.tipo === filtro)
      .sort((a, b) => b.data.localeCompare(a.data) || b.criado.em.localeCompare(a.criado.em));
  }, [movs, filtro]);

  const nomeItem = (id: string) => itens.find((i) => i.id === id)?.nome ?? 'Item removido';
  const nomeLocal = (id?: string) => locais.find((l) => l.id === id)?.nome ?? '';
  const resumo = (g: Grupo) => {
    const m = g.linhas[0];
    if (g.tipo === 'entrada') return [m.fornecedor, m.notaFiscal && `NF ${m.notaFiscal}`].filter(Boolean).join(' · ') || 'Sem nota fiscal';
    if (g.tipo === 'saida') return `${nomeLocal(m.localId)}${m.funcionarioId ? ` · ${funcs.find((f) => f.id === m.funcionarioId)?.nome ?? ''}` : ''}`;
    if (g.tipo === 'devolucao') return `de ${nomeLocal(m.localId)}`;
    if (g.tipo === 'transferencia') return `${nomeLocal(m.localId)} → ${nomeLocal(m.localDestinoId)}`;
    return m.observacao ?? '';
  };

  if (aberto) {
    const ls = movs.filter((m) => m.grupo === aberto);
    const grupo: Grupo | undefined = ls.length ? { id: aberto, tipo: ls[0].tipo, data: ls[0].data, criado: ls[0].criado, linhas: ls } : undefined;
    if (grupo) {
      return (
        <DetalheLancamento estoque={estoque} grupo={grupo} itens={itens} locais={locais} funcionarios={funcs} posicao={posicao}
          onVoltar={() => setAberto(undefined)} onAlterou={() => { setRecarregar((n) => n + 1); onAlterou?.(); }} />
      );
    }
  }

  return (
    <FlatList
      data={grupos.slice(0, limite)}
      keyExtractor={(g) => g.id}
      contentContainerStyle={estilos.conteudo}
      ListHeaderComponent={
        <Chips prefixo="tipo" valor={filtro} onMudar={setFiltro} opcoes={[
          { id: 'todos', titulo: 'Todos' }, { id: 'entrada', titulo: 'Entradas' }, { id: 'saida', titulo: 'Saídas' },
          { id: 'devolucao', titulo: 'Devoluções' }, { id: 'transferencia', titulo: 'Transferências' }, { id: 'ajuste', titulo: 'Ajustes' },
        ]} />
      }
      ListEmptyComponent={<Text style={estilos.subtitulo}>Nenhum lançamento.</Text>}
      ListFooterComponent={grupos.length > limite ? <Botao titulo="Mostrar mais" secundario onPress={() => setLimite((n) => n + 50)} /> : undefined}
      renderItem={({ item: g }) => {
        const ativas = g.linhas.filter((m) => !m.cancelado);
        const valor = ativas.reduce((t, m) => t + (posicao?.custos[m.id]?.valor ?? 0), 0);
        return (
          <Pressable testID={`grupo-${g.id}`} onPress={() => setAberto(g.id)} style={[estilos.card, !ativas.length && { opacity: 0.5 }]}>
            <View style={estilos.linha}>
              <Text style={[estilos.titulo, { flex: 1 }]}>{`${NOME_TIPO[g.tipo]} · ${formatarDataBR(g.data)}`}</Text>
              <Text style={estilos.valor}>{formatarMoeda(valor)}</Text>
            </View>
            <Text style={estilos.subtitulo}>{resumo(g)}</Text>
            <Text style={estilos.subtitulo}>
              {`${g.linhas.length === 1 ? nomeItem(g.linhas[0].itemId) : `${g.linhas.length} itens`} · por ${g.criado.nome}`}
              {!ativas.length ? ' · CANCELADO' : g.linhas.some((m) => m.alterado) ? ' · editado' : ''}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

function DetalheLancamento({ estoque, grupo, itens, locais, funcionarios, posicao, onVoltar, onAlterou }: {
  estoque: Estoque; grupo: Grupo; itens: Item[]; locais: Local[]; funcionarios: Funcionario[]; posicao?: Posicao;
  onVoltar: () => void; onAlterou: () => void;
}) {
  const m0 = grupo.linhas.find((m) => !m.cancelado) ?? grupo.linhas[0];
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [editandoCab, setEditandoCab] = useState(false);
  const [data, setData] = useState(formatarDataBR(m0.data));
  const [nf, setNf] = useState(m0.notaFiscal ?? '');
  const [fornecedor, setFornecedor] = useState(m0.fornecedor ?? '');
  const [localId, setLocalId] = useState(m0.localId);
  const [destinoId, setDestinoId] = useState(m0.localDestinoId);
  const [funcionarioId, setFuncionarioId] = useState(m0.funcionarioId);
  const [obs, setObs] = useState(m0.observacao ?? '');
  const [linhaEditada, setLinhaEditada] = useState<string>();
  const [qtd, setQtd] = useState('');
  const [custo, setCusto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [cancelando, setCancelando] = useState<string>();
  const [erro, setErro] = useState<string>();

  useEffect(() => { void estoque.anexos(grupo.id).then(setAnexos); }, [estoque, grupo.id]);

  const item = (id: string) => itens.find((i) => i.id === id);
  const nomeLocal = (id?: string) => locais.find((l) => l.id === id)?.nome ?? '—';
  const opLocal = locais.filter((l) => l.ativo || l.id === localId || l.id === destinoId).map((l) => ({ id: l.id, titulo: l.nome, subtitulo: l.centroCusto }));

  async function executar(f: () => Promise<unknown>) {
    setErro(undefined);
    try { await f(); onAlterou(); return true; } catch (e) { setErro((e as Error).message); return false; }
  }

  const salvarCabecalho = () => executar(async () => {
    await estoque.editarGrupo(grupo.id, {
      data: analisarDataBR(data), notaFiscal: nf, fornecedor, observacao: obs,
      ...(grupo.tipo !== 'entrada' && grupo.tipo !== 'ajuste' ? { localId } : {}),
      ...(grupo.tipo === 'transferencia' ? { localDestinoId: destinoId } : {}),
      ...(grupo.tipo === 'saida' || grupo.tipo === 'devolucao' ? { funcionarioId } : {}),
    });
    setEditandoCab(false);
  });

  const salvarLinha = (m: Movimento) => executar(async () => {
    const q = lerNumero(qtd);
    const it = item(m.itemId);
    if (q === undefined || (grupo.tipo !== 'ajuste' && q <= 0)) throw new Error('Quantidade inválida');
    const campos: { quantidade: number; custoUnitario?: number } = { quantidade: q };
    if (grupo.tipo === 'entrada') {
      const c = lerNumero(custo);
      if (c === undefined || c < 0) throw new Error(`Informe o valor unitário${it ? ` (R$/${it.unidade})` : ''}`);
      campos.custoUnitario = c;
    }
    await estoque.editarMovimento(m.id, campos);
    setLinhaEditada(undefined);
  });

  const cancelar = (m: Movimento) => executar(async () => {
    await estoque.cancelarMovimento(m.id, motivo);
    setCancelando(undefined);
    setMotivo('');
  });

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Pressable testID="voltar-historico" onPress={onVoltar} hitSlop={10}><Text style={{ color: cores.primaria, fontWeight: '600' }}>‹ Histórico</Text></Pressable>
      <Cartao>
        <Text style={estilos.titulo}>{`${NOME_TIPO[grupo.tipo]} · ${formatarDataBR(m0.data)}`}</Text>
        {grupo.tipo === 'entrada' && <Text style={estilos.subtitulo}>{`Fornecedor: ${m0.fornecedor ?? '—'} · NF: ${m0.notaFiscal ?? '—'}`}</Text>}
        {m0.localId && <Text style={estilos.subtitulo}>{`${grupo.tipo === 'saida' ? 'Destino' : 'Origem'}: ${nomeLocal(m0.localId)}`}</Text>}
        {m0.localDestinoId && <Text style={estilos.subtitulo}>{`Destino: ${nomeLocal(m0.localDestinoId)}`}</Text>}
        {m0.funcionarioId && <Text style={estilos.subtitulo}>{`${grupo.tipo === 'saida' ? 'Retirou' : 'Devolveu'}: ${funcionarios.find((f) => f.id === m0.funcionarioId)?.nome ?? '—'}`}</Text>}
        {m0.observacao && <Text style={estilos.subtitulo}>{`Obs.: ${m0.observacao}`}</Text>}
        <Text style={estilos.subtitulo}>{`Lançado por ${quando(grupo.criado)}`}</Text>
        {grupo.tipo !== 'ajuste' && !editandoCab && grupo.linhas.some((m) => !m.cancelado) && (
          <Botao testID="editar-cabecalho" titulo="Editar dados do lançamento" secundario onPress={() => setEditandoCab(true)} />
        )}
        {editandoCab && (
          <View style={{ gap: 8 }}>
            <Campo testID="editar-data" rotulo="Data" value={data} onChangeText={setData} keyboardType="numbers-and-punctuation" />
            {grupo.tipo === 'entrada' && (
              <>
                <Campo testID="editar-nota" rotulo="Nota fiscal" value={nf} onChangeText={setNf} />
                <Campo testID="editar-fornecedor" rotulo="Fornecedor" value={fornecedor} onChangeText={setFornecedor} />
              </>
            )}
            {grupo.tipo !== 'entrada' && <Seletor testID="editar-local" rotulo={grupo.tipo === 'saida' ? 'Destino' : 'Origem'} valor={localId} opcoes={opLocal} onEscolher={setLocalId} />}
            {grupo.tipo === 'transferencia' && <Seletor testID="editar-destino" rotulo="Destino" valor={destinoId} opcoes={opLocal} onEscolher={setDestinoId} />}
            {(grupo.tipo === 'saida' || grupo.tipo === 'devolucao') && (
              <Seletor testID="editar-funcionario" rotulo={grupo.tipo === 'saida' ? 'Quem retirou' : 'Quem devolveu'} valor={funcionarioId}
                opcoes={funcionarios.filter((f) => f.ativo || f.id === funcionarioId).map((f) => ({ id: f.id, titulo: f.nome }))} onEscolher={setFuncionarioId} />
            )}
            <Campo testID="editar-obs" rotulo="Observação" value={obs} onChangeText={setObs} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Botao titulo="Desistir" secundario onPress={() => setEditandoCab(false)} />
              <Botao testID="salvar-cabecalho" titulo="Salvar" onPress={() => void salvarCabecalho()} />
            </View>
          </View>
        )}
      </Cartao>

      {anexos.length > 0 && (
        <>
          <Text style={estilos.secao}>Fotos</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {anexos.map((a) => (a.uri
              ? <Image key={a.id} source={{ uri: a.uri }} style={{ width: 140, height: 140, borderRadius: 10 }} />
              : <Text key={a.id} style={estilos.subtitulo}>Foto ainda não baixada</Text>))}
          </View>
        </>
      )}

      <Text style={estilos.secao}>Itens</Text>
      {grupo.linhas.map((m) => {
        const it = item(m.itemId);
        const c = posicao?.custos[m.id];
        return (
          <Cartao key={m.id}>
            <Text style={[estilos.titulo, m.cancelado && { textDecorationLine: 'line-through' }]}>{it?.nome ?? 'Item removido'}</Text>
            <Text style={estilos.subtitulo}>
              {`${it ? formatarQuantidade(it, m.quantidade) : m.quantidade}${c ? ` · ${formatarMoeda(c.custoUnitario)}/${it?.unidade ?? 'un'} · ${formatarMoeda(c.valor)}` : ''}`}
            </Text>
            {m.alterado && <Text testID={`editado-${m.id}`} style={estilos.subtitulo}>{`Editado por ${quando(m.alterado)}`}</Text>}
            {m.cancelado && <Text style={{ color: cores.erro }}>{`Cancelado por ${quando(m.cancelado)} — ${m.cancelado.motivo}`}</Text>}
            {!m.cancelado && linhaEditada !== m.id && cancelando !== m.id && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Botao testID={`editar-${m.id}`} titulo="Editar" secundario onPress={() => {
                  setLinhaEditada(m.id); setQtd(String(m.quantidade).replace('.', ',')); setCusto(String(m.custoUnitario ?? '').replace('.', ','));
                }} />
                <Botao testID={`cancelar-${m.id}`} titulo="Cancelar" perigo onPress={() => setCancelando(m.id)} />
              </View>
            )}
            {linhaEditada === m.id && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Campo testID="editar-qtd" rotulo={`Quantidade (${it?.unidade ?? ''})`} value={qtd} onChangeText={setQtd} keyboardType="numbers-and-punctuation" style={{ flex: 1 }} />
                  {grupo.tipo === 'entrada' && <Campo testID="editar-custo" rotulo={`Valor unit. (R$/${it?.unidade ?? ''})`} value={custo} onChangeText={setCusto} keyboardType="decimal-pad" style={{ flex: 1 }} />}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Botao titulo="Desistir" secundario onPress={() => setLinhaEditada(undefined)} />
                  <Botao testID="salvar-linha" titulo="Salvar" onPress={() => void salvarLinha(m)} />
                </View>
              </View>
            )}
            {cancelando === m.id && (
              <View style={{ gap: 8 }}>
                <Campo testID="motivo" rotulo="Motivo do cancelamento" value={motivo} onChangeText={setMotivo} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Botao titulo="Desistir" secundario onPress={() => setCancelando(undefined)} />
                  <Botao testID="confirmar-cancelamento" titulo="Cancelar item" perigo onPress={() => void cancelar(m)} />
                </View>
              </View>
            )}
          </Cartao>
        );
      })}
      <Mensagem erro={erro} />
    </ScrollView>
  );
}
