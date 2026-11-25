import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { adicionarDias, analisarDataBR, formatarDataBR } from '../domain/datas';
import { chavePosse, divergenciasDeCobranca, emPrazo, posicoesDoBem, situacaoLocacao, totalDoBem, type PosseComQuantidade } from '../domain/bens';
import { lerNumero, formatarMoeda } from '../domain/formato';
import { porPeriodo, type Bem, type Funcionario, Local, MotivoSaidaBem, MovimentoBem, Posse } from '../domain/tipos';
import { Botao, Campo, Cartao, Chips, filtrar, Mensagem, Seletor } from './componentes';
import { cores, estilos } from './estilos';
import { EscolhaPosse, FormBem } from './FormBem';

type Filtro = 'todos' | 'ferramenta' | 'locado' | 'alertas';
const PRAZO_PADRAO_DIAS = 7;
const nomeBem = (b?: Bem) => (b ? `${b.nome}${b.codigo ? ` ${b.codigo}` : ''}` : 'Cadastro removido');

interface Dados { bens: Bem[]; movs: MovimentoBem[]; funcs: Funcionario[]; locais: Local[] }

function descrever(p: Posse, d: Dados): string {
  if (p.tipo === 'galpao') return 'Galpão';
  if (p.tipo === 'externo') return 'Fora da empresa';
  return `${d.funcs.find((f) => f.id === p.funcionarioId)?.nome ?? '?'} · ${d.locais.find((l) => l.id === p.localId)?.nome ?? '?'}`;
}

/** Alertas de um bem: prazo da locação, ferramenta atrasada e peças em obra diferente da cobrada. */
function alertasDoBem(b: Bem, d: Dados, hoje: string): string[] {
  const pos = posicoesDoBem(d.movs, b.id);
  const total = pos.reduce((t, p) => t + p.quantidade, 0);
  const lista: string[] = [];
  const loc = situacaoLocacao(b, total, hoje);
  if (loc?.situacao === 'vencida') lista.push(`Locação vencida há ${-loc.dias} d`);
  if (loc?.situacao === 'vence') lista.push(loc.dias === 0 ? 'Locação vence hoje' : `Locação vence em ${loc.dias} d`);
  const prazo = b.controle === 'unidade' ? emPrazo(d.movs, b.id, hoje) : undefined;
  if (prazo && prazo.atraso > 0) lista.push(`Devolução atrasada ${prazo.atraso} d`);
  for (const x of divergenciasDeCobranca(b, pos)) lista.push(`${x.quantidade} em ${d.locais.find((l) => l.id === x.localId)?.nome ?? '?'}, outra obra que a cobrada`);
  return lista;
}

interface Props { estoque: Estoque; hoje: string; versao?: number; onAlterou?: () => void }

/** Ferramentas e equipamentos locados: onde está cada um, quem está com ele e todas as movimentações. */
export function EquipamentosTela({ estoque, hoje, versao = 0, onAlterou }: Props) {
  const [dados, setDados] = useState<Dados>({ bens: [], movs: [], funcs: [], locais: [] });
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [modo, setModo] = useState<{ tela: 'lista' } | { tela: 'novo' } | { tela: 'editar' | 'detalhe'; id: string }>({ tela: 'lista' });
  const [recarregar, setRecarregar] = useState(0);

  useEffect(() => {
    void Promise.all([estoque.bens(true), estoque.movimentosBens(), estoque.funcionarios(true, 'galpao'), estoque.locais(true)])
      .then(([bens, movs, funcs, locais]) => setDados({ bens, movs, funcs, locais }));
  }, [estoque, versao, recarregar]);
  const mudou = () => { setRecarregar((n) => n + 1); onAlterou?.(); };

  const ativos = useMemo(() => dados.bens.filter((b) => b.ativo), [dados.bens]);
  const alertas = useMemo(() => new Map(ativos.map((b) => [b.id, alertasDoBem(b, dados, hoje)])), [ativos, dados, hoje]);
  const contagem = {
    todos: ativos.length, ferramenta: ativos.filter((b) => b.tipo === 'ferramenta').length, locado: ativos.filter((b) => b.tipo === 'locado').length,
    alertas: ativos.filter((b) => alertas.get(b.id)?.length).length,
  };
  const textoDe = (b: Bem) => `${nomeBem(b)} ${posicoesDoBem(dados.movs, b.id).map((p) => descrever(p.posse, dados)).join(' ')} ${b.locacao?.locadora ?? ''}`;
  const lista = useMemo(() => filtrar(ativos.filter((b) => (filtro === 'alertas' ? !!alertas.get(b.id)?.length : filtro === 'todos' || b.tipo === filtro)), busca, textoDe),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ativos, alertas, filtro, busca, dados]);

  if (modo.tela === 'novo') {
    return <FormBem estoque={estoque} hoje={hoje} funcionarios={dados.funcs} locais={dados.locais} onVoltar={() => setModo({ tela: 'lista' })}
      onFim={(id) => { mudou(); setModo(id ? { tela: 'detalhe', id } : { tela: 'lista' }); }} />;
  }
  const bem = 'id' in modo ? dados.bens.find((b) => b.id === modo.id) : undefined;
  if (modo.tela === 'editar' && bem) {
    return <FormBem estoque={estoque} bem={bem} hoje={hoje} funcionarios={dados.funcs} locais={dados.locais} onVoltar={() => setModo({ tela: 'detalhe', id: bem.id })}
      onFim={() => { mudou(); setModo({ tela: 'detalhe', id: bem.id }); }} />;
  }
  if (modo.tela === 'detalhe' && bem) {
    return <Detalhe estoque={estoque} bem={bem} dados={dados} hoje={hoje} onVoltar={() => setModo({ tela: 'lista' })} onEditar={() => setModo({ tela: 'editar', id: bem.id })} onAlterou={mudou} />;
  }

  return (
    <FlatList
      data={lista}
      keyExtractor={(b) => b.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={estilos.conteudo}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Chips prefixo="equip" valor={filtro} onMudar={setFiltro} opcoes={[
            { id: 'todos', titulo: `Todos (${contagem.todos})` }, { id: 'ferramenta', titulo: `Ferramentas (${contagem.ferramenta})` },
            { id: 'locado', titulo: `Locados (${contagem.locado})` }, { id: 'alertas', titulo: `Alertas (${contagem.alertas})` },
          ]} />
          <Campo testID="busca-equip" rotulo="Buscar" value={busca} onChangeText={setBusca} placeholder="Nome, quem está com ele, locadora" />
          <Botao testID="novo-bem" titulo="+ Cadastrar ferramenta ou equipamento" secundario onPress={() => setModo({ tela: 'novo' })} />
        </View>
      }
      ListEmptyComponent={<Text style={estilos.subtitulo}>{ativos.length ? 'Nada neste filtro.' : 'Nada cadastrado ainda. Use o botão acima para fazer o levantamento.'}</Text>}
      renderItem={({ item: b }) => {
        const pos = posicoesDoBem(dados.movs, b.id);
        const total = pos.reduce((t, p) => t + p.quantidade, 0);
        const avisos = alertas.get(b.id) ?? [];
        return (
          <Pressable testID={`bem-${b.id}`} onPress={() => setModo({ tela: 'detalhe', id: b.id })} style={estilos.card}>
            <View style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.titulo}>{nomeBem(b)}</Text>
                <Text style={estilos.subtitulo}>
                  {b.controle === 'unidade'
                    ? (pos[0] ? descrever(pos[0].posse, dados) : 'Sem posse registrada')
                    : (pos.map((p) => `${descrever(p.posse, dados)} ${p.quantidade}`).join(' · ') || 'Sem peças')}
                </Text>
              </View>
              {b.controle === 'quantidade' && <Text style={{ fontSize: 22, fontWeight: '800', color: cores.texto }}>{total}</Text>}
              {b.tipo === 'locado' && <Text style={estilos.etiqueta}>Locado</Text>}
            </View>
            {avisos.map((a) => <Text key={a} style={{ color: cores.aviso, fontWeight: '700', fontSize: 13 }}>{a}</Text>)}
          </Pressable>
        );
      }}
    />
  );
}

type Destino = 'galpao' | 'campo' | 'locadora' | 'perda' | 'baixa';
const MOTIVO: Record<Exclude<Destino, 'galpao' | 'campo'>, MotivoSaidaBem> = { locadora: 'devolucao-locadora', perda: 'perda', baixa: 'baixa' };

function Detalhe({ estoque, bem, dados, hoje, onVoltar, onEditar, onAlterou }: {
  estoque: Estoque; bem: Bem; dados: Dados; hoje: string; onVoltar: () => void; onEditar: () => void; onAlterou: () => void;
}) {
  const posicoes = posicoesDoBem(dados.movs, bem.id);
  const unidade = bem.controle === 'unidade';
  const [origemChave, setOrigemChave] = useState<string | undefined>(unidade && posicoes.length === 1 ? chavePosse(posicoes[0].posse) : undefined);
  const [destino, setDestino] = useState<Destino>('campo');
  const [posseCampo, setPosseCampo] = useState<Posse | undefined>();
  const [qtd, setQtd] = useState('1');
  const [data, setData] = useState(formatarDataBR(hoje));
  const [prevista, setPrevista] = useState(formatarDataBR(adicionarDias(hoje, PRAZO_PADRAO_DIAS)));
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState<string>();
  const [cancelando, setCancelando] = useState<string>();
  const [motivo, setMotivo] = useState('');

  async function executar(f: () => Promise<string>) {
    setErro(undefined); setOk(undefined);
    try { setOk(await f()); onAlterou(); } catch (e) { setErro((e as Error).message); }
  }

  const origemOpcoes = [
    ...posicoes.map((p: PosseComQuantidade) => ({ id: chavePosse(p.posse), titulo: descrever(p.posse, dados), subtitulo: `${p.quantidade} ${p.quantidade === 1 ? 'peça' : 'peças'}` })),
    ...(unidade && posicoes.length ? [] : [{ id: 'externo', titulo: 'Chegou de fora', subtitulo: 'Compra, locadora ou levantamento' }]),
  ];

  const registrar = () => executar(async () => {
    const origem: Posse | undefined = origemChave === 'externo' ? { tipo: 'externo' } : posicoes.find((p) => chavePosse(p.posse) === origemChave)?.posse;
    if (!origem) throw new Error('Informe de onde sai');
    let dest: Posse;
    if (destino === 'galpao') dest = { tipo: 'galpao' };
    else if (destino === 'campo') { if (!posseCampo) throw new Error('Informe com quem e em qual frente de serviço vai'); dest = posseCampo; }
    else dest = { tipo: 'externo' };
    const dataIso = analisarDataBR(data);
    const q = unidade ? 1 : lerNumero(qtd) ?? NaN;
    await estoque.movimentarBem({
      bemId: bem.id, data: dataIso, quantidade: q, origem, destino: dest,
      ...(destino === 'locadora' || destino === 'perda' || destino === 'baixa' ? { motivo: MOTIVO[destino] } : {}),
      ...(destino === 'campo' && unidade && prevista.trim() ? { prevista: analisarDataBR(prevista) } : {}),
      observacao: obs,
    });
    setObs('');
    return 'Movimentação registrada.';
  });

  const cancelar = (id: string) => executar(async () => {
    await estoque.cancelarMovimentoBem(id, motivo);
    setCancelando(undefined); setMotivo('');
    return 'Movimentação cancelada.';
  });

  const movs = dados.movs.filter((m) => m.bemId === bem.id).sort((a, b) => b.data.localeCompare(a.data) || b.criado.em.localeCompare(a.criado.em));
  const avisos = alertasDoBem(bem, dados, hoje);
  const prazo = unidade ? emPrazo(dados.movs, bem.id, hoje) : undefined;
  const total = totalDoBem(dados.movs, bem.id);
  const l = bem.locacao;
  const textoMov = (m: MovimentoBem) => {
    const qt = unidade ? '' : `${m.quantidade} · `;
    if (m.origem.tipo === 'externo' && m.destino.tipo !== 'externo') return `${qt}Chegou em ${descrever(m.destino, dados)}`;
    if (m.destino.tipo === 'externo') return `${qt}${descrever(m.origem, dados)} → ${m.motivo === 'devolucao-locadora' ? 'devolvido à locadora' : m.motivo === 'perda' ? 'perdido' : 'baixa'}`;
    return `${qt}${descrever(m.origem, dados)} → ${descrever(m.destino, dados)}`;
  };

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <Pressable testID="voltar-equip" onPress={onVoltar} hitSlop={10}><Text style={{ color: cores.primaria, fontWeight: '600' }}>‹ Ferramentas e equipamentos</Text></Pressable>
      <Cartao>
        <View style={estilos.linha}>
          <Text style={[estilos.titulo, { flex: 1 }]}>{nomeBem(bem)}</Text>
          {bem.tipo === 'locado' && <Text style={estilos.etiqueta}>Locado</Text>}
        </View>
        {!bem.ativo && <Text style={{ color: cores.aviso, fontWeight: '700' }}>Cadastro inativo</Text>}
        {avisos.map((a) => <Text key={a} style={{ color: cores.aviso, fontWeight: '700' }}>{a}</Text>)}
        {prazo && prazo.atraso === 0 && <Text style={estilos.subtitulo}>{`Devolver até ${formatarDataBR(prazo.prevista)}`}</Text>}
        {l && (
          <>
            <Text style={estilos.subtitulo}>{`Locadora: ${l.locadora}${l.contrato ? ` · contrato ${l.contrato}` : ''}`}</Text>
            {l.valor !== undefined && <Text style={estilos.subtitulo}>{`${formatarMoeda(l.valor)} por peça, por ${porPeriodo(l.periodo)}`}</Text>}
            {(l.inicio || l.prevista) && <Text style={estilos.subtitulo}>{`${l.inicio ? `Desde ${formatarDataBR(l.inicio)}` : ''}${l.inicio && l.prevista ? ' · ' : ''}${l.prevista ? `fim previsto ${formatarDataBR(l.prevista)}` : ''}`}</Text>}
            {l.localCobrancaId && <Text style={estilos.subtitulo}>{`Cobrado na obra: ${dados.locais.find((x) => x.id === l.localCobrancaId)?.nome ?? '?'}`}</Text>}
          </>
        )}
        {bem.observacao && <Text style={estilos.subtitulo}>{bem.observacao}</Text>}
        <Botao testID="editar-bem" titulo="Editar cadastro" secundario onPress={onEditar} />
      </Cartao>

      <Text style={estilos.secao}>{unidade ? 'Onde está' : `Onde estão (${total})`}</Text>
      <Cartao gap={4}>
        {posicoes.length === 0 && <Text style={estilos.subtitulo}>Nenhuma peça em posse da empresa.</Text>}
        {posicoes.map((p) => (
          <View key={chavePosse(p.posse)} style={estilos.linha}>
            <Text style={[estilos.titulo, { flex: 1 }]}>{descrever(p.posse, dados)}</Text>
            {!unidade && <Text style={estilos.valor}>{p.quantidade}</Text>}
          </View>
        ))}
      </Cartao>

      <Mensagem erro={erro} ok={ok} />

      {bem.ativo && (
        <>
          <Text style={estilos.secao}>Movimentar</Text>
          <Cartao>
            {!unidade && <Campo testID="mov-qtd" rotulo="Quantidade de peças" value={qtd} onChangeText={setQtd} keyboardType="number-pad" />}
            <Seletor testID="mov-origem" rotulo="De onde sai" valor={origemChave} opcoes={origemOpcoes} onEscolher={setOrigemChave} />
            <Text style={estilos.rotulo}>Para onde vai</Text>
            <Chips prefixo="mov-destino" valor={destino} onMudar={setDestino} opcoes={[
              { id: 'campo', titulo: 'Pessoa em obra' }, { id: 'galpao', titulo: 'Galpão' },
              ...(bem.tipo === 'locado' ? [{ id: 'locadora' as const, titulo: 'Devolver à locadora' }] : []),
              { id: 'perda', titulo: 'Perdido' }, { id: 'baixa', titulo: 'Baixa' },
            ]} />
            {destino === 'campo' && (
              <EscolhaPosse prefixo="mov" valor={posseCampo ?? undefined} onMudar={setPosseCampo} funcionarios={dados.funcs} locais={dados.locais} rotulo="Para quem e onde" soCampo />
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Campo testID="mov-data" rotulo="Data" value={data} onChangeText={setData} style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />
              {destino === 'campo' && unidade && <Campo testID="mov-prevista" rotulo="Devolver até" value={prevista} onChangeText={setPrevista} style={{ flex: 1 }} keyboardType="numbers-and-punctuation" />}
            </View>
            <Campo testID="mov-obs" rotulo="Observação" value={obs} onChangeText={setObs} placeholder="Opcional" />
            <Botao testID="registrar-mov" titulo="Registrar movimentação" onPress={() => void registrar()} />
          </Cartao>
        </>
      )}

      <Text style={estilos.secao}>Histórico</Text>
      {movs.length === 0 && <Text style={estilos.subtitulo}>Nenhuma movimentação.</Text>}
      {movs.slice(0, 30).map((m) => (
        <Cartao key={m.id} gap={2}>
          <Text style={[estilos.titulo, m.cancelado && { textDecorationLine: 'line-through', color: cores.suave }]}>{textoMov(m)}</Text>
          <Text style={estilos.subtitulo}>{`${formatarDataBR(m.data)}${m.prevista ? ` · devolver até ${formatarDataBR(m.prevista)}` : ''}${m.observacao ? ` · ${m.observacao}` : ''}`}</Text>
          <Text style={estilos.subtitulo}>{`Lançado por ${m.criado.nome}${m.alterado ? ' · editado' : ''}`}</Text>
          {m.cancelado && <Text style={{ color: cores.erro }}>{`Cancelado por ${m.cancelado.nome} — ${m.cancelado.motivo}`}</Text>}
          {!m.cancelado && cancelando !== m.id && <Botao testID={`cancelar-mov-${m.id}`} titulo="Cancelar lançamento" perigo onPress={() => { setCancelando(m.id); setMotivo(''); }} />}
          {cancelando === m.id && (
            <View style={{ gap: 8 }}>
              <Campo testID="mov-motivo" rotulo="Motivo do cancelamento" value={motivo} onChangeText={setMotivo} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Botao titulo="Desistir" secundario onPress={() => setCancelando(undefined)} />
                <Botao testID="confirmar-cancelar-mov" titulo="Cancelar" perigo onPress={() => void cancelar(m.id)} />
              </View>
            </View>
          )}
        </Cartao>
      ))}
    </ScrollView>
  );
}
