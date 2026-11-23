import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { adicionarDias, analisarDataBR, formatarDataBR } from '../domain/datas';
import { atrasado, diasDeAtraso, diasEntre as diasEntreDatas, emprestimoAberto } from '../domain/ferramentas';
import type { Emprestimo, Ferramenta, Funcionario, Local } from '../domain/tipos';
import { Botao, Campo, Cartao, Chips, filtrar, Mensagem, Seletor } from './componentes';
import { cores, estilos } from './estilos';

type Filtro = 'todas' | 'fora' | 'atrasadas' | 'galpao';
const PRAZO_PADRAO_DIAS = 7;

interface Props { estoque: Estoque; hoje: string; versao?: number; onAlterou?: () => void }

const rotuloFerramenta = (f?: Ferramenta) => (f ? `${f.nome}${f.codigo ? ` ${f.codigo}` : ''}` : 'Ferramenta removida');

/** Ferramentas individuais: quem está com cada uma, prazo de devolução e histórico de empréstimos. */
export function FerramentasTela({ estoque, hoje, versao = 0, onAlterou }: Props) {
  const [ferramentas, setFerramentas] = useState<Ferramenta[]>([]);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string>();
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    void Promise.all([estoque.ferramentas(), estoque.emprestimos(), estoque.funcionarios(true), estoque.locais(true)])
      .then(([f, e, fu, l]) => { setFerramentas(f); setEmprestimos(e); setFuncs(fu); setLocais(l); });
  }, [estoque, versao, recarregar]);

  const aberto = useMemo(() => new Map(emprestimos.filter(emprestimoAberto).map((e) => [e.ferramentaId, e])), [emprestimos]);
  const nomeFunc = (id: string) => funcs.find((f) => f.id === id)?.nome ?? '—';
  const contagem = {
    todas: ferramentas.length,
    fora: ferramentas.filter((f) => aberto.has(f.id)).length,
    atrasadas: ferramentas.filter((f) => { const e = aberto.get(f.id); return e && atrasado(e, hoje); }).length,
    galpao: ferramentas.filter((f) => !aberto.has(f.id)).length,
  };

  const lista = useMemo(() => filtrar(ferramentas.filter((f) => {
    const e = aberto.get(f.id);
    if (filtro === 'fora') return !!e;
    if (filtro === 'atrasadas') return !!e && atrasado(e, hoje);
    if (filtro === 'galpao') return !e;
    return true;
  }), busca, (f) => `${rotuloFerramenta(f)} ${aberto.has(f.id) ? nomeFunc(aberto.get(f.id)!.funcionarioId) : ''}`),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [ferramentas, aberto, filtro, busca, hoje, funcs]);

  const ferramenta = ferramentas.find((f) => f.id === aberta);
  if (ferramenta) {
    return (
      <DetalheFerramenta estoque={estoque} ferramenta={ferramenta} emprestimos={emprestimos.filter((e) => e.ferramentaId === ferramenta.id)}
        funcionarios={funcs} locais={locais} hoje={hoje} onVoltar={() => setAberta(undefined)}
        onAlterou={() => { setRecarregar((n) => n + 1); onAlterou?.(); }} />
    );
  }

  return (
    <FlatList
      data={lista}
      keyExtractor={(f) => f.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={estilos.conteudo}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Chips prefixo="ferr" valor={filtro} onMudar={setFiltro} opcoes={[
            { id: 'todas', titulo: `Todas (${contagem.todas})` }, { id: 'fora', titulo: `Fora (${contagem.fora})` },
            { id: 'atrasadas', titulo: `Atrasadas (${contagem.atrasadas})` }, { id: 'galpao', titulo: `No galpão (${contagem.galpao})` },
          ]} />
          <Campo testID="busca-ferramenta" rotulo="Buscar" value={busca} onChangeText={setBusca} placeholder="Ferramenta ou funcionário" />
        </View>
      }
      ListEmptyComponent={<Text style={estilos.subtitulo}>
        {ferramentas.length ? 'Nenhuma ferramenta neste filtro.' : 'Nenhuma ferramenta cadastrada. Cadastre em Cadastros → Ferramentas.'}
      </Text>}
      renderItem={({ item: f }) => {
        const e = aberto.get(f.id);
        const atras = e ? atrasado(e, hoje) : false;
        return (
          <Pressable testID={`ferramenta-${f.id}`} onPress={() => setAberta(f.id)} style={estilos.card}>
            <View style={estilos.linha}>
              <Text style={[estilos.titulo, { flex: 1 }]}>{rotuloFerramenta(f)}</Text>
              <Text testID={`situacao-${f.id}`} style={{ fontWeight: '700', color: !e ? cores.ok : atras ? cores.erro : cores.aviso }}>
                {!e ? 'No galpão' : atras ? `Atrasada ${diasDeAtraso(e, hoje)} d` : 'Fora'}
              </Text>
            </View>
            {e && <Text style={estilos.subtitulo}>{`Com ${nomeFunc(e.funcionarioId)} · devolver até ${formatarDataBR(e.prevista)}`}</Text>}
          </Pressable>
        );
      }}
    />
  );
}

function DetalheFerramenta({ estoque, ferramenta, emprestimos, funcionarios, locais, hoje, onVoltar, onAlterou }: {
  estoque: Estoque; ferramenta: Ferramenta; emprestimos: Emprestimo[]; funcionarios: Funcionario[]; locais: Local[]; hoje: string;
  onVoltar: () => void; onAlterou: () => void;
}) {
  const atual = emprestimos.find(emprestimoAberto);
  const [funcionarioId, setFuncionarioId] = useState<string>();
  const [localId, setLocalId] = useState<string>();
  const [saida, setSaida] = useState(formatarDataBR(hoje));
  const [prevista, setPrevista] = useState(formatarDataBR(adicionarDias(hoje, PRAZO_PADRAO_DIAS)));
  const [obs, setObs] = useState('');
  const [devolvidoEm, setDevolvidoEm] = useState(formatarDataBR(hoje));
  const [estado, setEstado] = useState('');
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState<string>();
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const nome = (id: string) => funcionarios.find((f) => f.id === id)?.nome ?? '—';
  const nomeLocal = (id?: string) => locais.find((l) => l.id === id)?.nome;

  async function executar(f: () => Promise<string>) {
    setErro(undefined); setOk(undefined);
    try { setOk(await f()); onAlterou(); } catch (e) { setErro((e as Error).message); }
  }

  const emprestar = () => executar(async () => {
    if (!funcionarioId) throw new Error('Informe quem retirou');
    await estoque.emprestar({ ferramentaId: ferramenta.id, funcionarioId, localId, saida: analisarDataBR(saida), prevista: analisarDataBR(prevista), observacao: obs });
    setObs(''); setFuncionarioId(undefined); setLocalId(undefined);
    return 'Empréstimo registrado.';
  });

  const devolver = () => executar(async () => {
    if (!atual) throw new Error('Essa ferramenta não está emprestada');
    await estoque.devolverFerramenta(atual.id, { devolvidoEm: analisarDataBR(devolvidoEm), observacaoDevolucao: estado });
    setEstado('');
    return 'Devolução registrada.';
  });

  const cancelar = () => executar(async () => {
    if (!atual) throw new Error('Essa ferramenta não está emprestada');
    await estoque.cancelarEmprestimo(atual.id, motivo);
    setCancelando(false); setMotivo('');
    return 'Empréstimo cancelado.';
  });

  const historico = [...emprestimos].filter((e) => !e.cancelado).sort((a, b) => b.saida.localeCompare(a.saida) || b.criado.em.localeCompare(a.criado.em));
  const opFunc = funcionarios.filter((f) => f.ativo).map((f) => ({ id: f.id, titulo: f.nome }));
  const opLocal = locais.filter((l) => l.ativo).map((l) => ({ id: l.id, titulo: l.nome, subtitulo: l.centroCusto }));

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Pressable testID="voltar-ferramentas" onPress={onVoltar} hitSlop={10}><Text style={{ color: cores.primaria, fontWeight: '600' }}>‹ Ferramentas</Text></Pressable>
      <Cartao>
        <Text style={estilos.titulo}>{rotuloFerramenta(ferramenta)}</Text>
        {atual ? (
          <>
            <Text style={{ color: atrasado(atual, hoje) ? cores.erro : cores.aviso, fontWeight: '700' }}>
              {atrasado(atual, hoje) ? `Atrasada há ${diasDeAtraso(atual, hoje)} dia(s)` : 'Fora do galpão'}
            </Text>
            <Text style={estilos.subtitulo}>{`Com ${nome(atual.funcionarioId)}${nomeLocal(atual.localId) ? ` · ${nomeLocal(atual.localId)}` : ''}`}</Text>
            <Text style={estilos.subtitulo}>{`Saiu em ${formatarDataBR(atual.saida)} · devolver até ${formatarDataBR(atual.prevista)}`}</Text>
            {atual.observacao && <Text style={estilos.subtitulo}>{`Obs.: ${atual.observacao}`}</Text>}
          </>
        ) : <Text style={{ color: cores.ok, fontWeight: '700' }}>No galpão</Text>}
      </Cartao>

      <Mensagem erro={erro} ok={ok} />

      {atual ? (
        <>
          <Text style={estilos.secao}>Registrar devolução</Text>
          <Cartao>
            <Campo testID="devolucao-data" rotulo="Data da devolução" value={devolvidoEm} onChangeText={setDevolvidoEm} keyboardType="numbers-and-punctuation" />
            <Campo testID="devolucao-estado" rotulo="Estado da ferramenta" value={estado} onChangeText={setEstado} placeholder="Opcional (ex.: cabo quebrado)" />
            <Botao testID="devolver" titulo="Registrar devolução" onPress={() => void devolver()} />
            {!cancelando && <Botao testID="cancelar-emprestimo" titulo="Cancelar este empréstimo (lançado por engano)" perigo onPress={() => setCancelando(true)} />}
            {cancelando && (
              <View style={{ gap: 8 }}>
                <Campo testID="motivo-emprestimo" rotulo="Motivo do cancelamento" value={motivo} onChangeText={setMotivo} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Botao titulo="Desistir" secundario onPress={() => setCancelando(false)} />
                  <Botao testID="confirmar-cancelamento-emprestimo" titulo="Cancelar empréstimo" perigo onPress={() => void cancelar()} />
                </View>
              </View>
            )}
          </Cartao>
        </>
      ) : (
        <>
          <Text style={estilos.secao}>Emprestar</Text>
          <Cartao>
            <Seletor testID="emprestimo-funcionario" rotulo="Quem retirou" valor={funcionarioId} opcoes={opFunc} onEscolher={setFuncionarioId} />
            <Seletor testID="emprestimo-local" rotulo="Frente de serviço (opcional)" valor={localId} opcoes={opLocal} onEscolher={setLocalId} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Campo testID="emprestimo-saida" rotulo="Saída" value={saida} onChangeText={setSaida} style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
              <Campo testID="emprestimo-prevista" rotulo="Devolver até" value={prevista} onChangeText={setPrevista} style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
            </View>
            <Campo testID="emprestimo-obs" rotulo="Observação" value={obs} onChangeText={setObs} placeholder="Opcional" />
            <Botao testID="emprestar" titulo="Registrar empréstimo" onPress={() => void emprestar()} />
          </Cartao>
        </>
      )}

      <Text style={estilos.secao}>Histórico</Text>
      {historico.length === 0 && <Text style={estilos.subtitulo}>Nenhum empréstimo ainda.</Text>}
      {historico.slice(0, 20).map((e) => (
        <Cartao key={e.id} gap={2}>
          <Text style={estilos.titulo}>{nome(e.funcionarioId)}</Text>
          <Text style={estilos.subtitulo}>
            {`${formatarDataBR(e.saida)} → ${e.devolvidoEm ? `devolvida em ${formatarDataBR(e.devolvidoEm)}` : 'ainda fora'} (previsto ${formatarDataBR(e.prevista)})`}
          </Text>
          {e.devolvidoEm && e.devolvidoEm > e.prevista && <Text style={{ color: cores.aviso }}>{`Devolvida com ${diasEntreDatas(e.prevista, e.devolvidoEm)} dia(s) de atraso`}</Text>}
          {e.observacaoDevolucao && <Text style={estilos.subtitulo}>{`Estado: ${e.observacaoDevolucao}`}</Text>}
          <Text style={estilos.subtitulo}>{`Emprestou: ${e.criado.nome}${e.devolvido ? ` · recebeu: ${e.devolvido.nome}` : ''}${e.alterado ? ' · editado' : ''}`}</Text>
        </Cartao>
      ))}
    </ScrollView>
  );
}

