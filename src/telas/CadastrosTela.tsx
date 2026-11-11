import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { formatarMoeda, formatarNumero, lerNumero } from '../domain/formato';
import type { Funcionario, Item, Local } from '../domain/tipos';
import { Botao, Campo, Cartao, Chips, filtrar, Mensagem } from './componentes';
import { estilos } from './estilos';

type Aba = 'itens' | 'locais' | 'funcionarios';
const UNIDADES = ['un', 'pç', 'lata', 'balde', 'galão', 'kg', 'm', 'm²', 'rolo', 'saco', 'cx'];

interface Props { estoque: Estoque; versao?: number; onAlterou?: () => void }

export function CadastrosTela({ estoque, versao = 0, onAlterou }: Props) {
  const [aba, setAba] = useState<Aba>('itens');
  const [itens, setItens] = useState<Item[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [editando, setEditando] = useState<string | 'novo'>();
  const [busca, setBusca] = useState('');
  const [recarregar, setRecarregar] = useState(0);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    void Promise.all([estoque.itens(true), estoque.locais(true), estoque.funcionarios(true)]).then(([i, l, f]) => { setItens(i); setLocais(l); setFuncs(f); });
  }, [estoque, versao, recarregar]);

  const salvo = () => { setEditando(undefined); setRecarregar((n) => n + 1); onAlterou?.(); };

  if (editando) {
    if (aba === 'itens') return <FormItem estoque={estoque} item={itens.find((i) => i.id === editando)} onFim={salvo} onVoltar={() => setEditando(undefined)} />;
    if (aba === 'locais') return <FormLocal estoque={estoque} local={locais.find((l) => l.id === editando)} centros={[...new Set(locais.map((l) => l.centroCusto))]} onFim={salvo} onVoltar={() => setEditando(undefined)} />;
    return <FormFuncionario estoque={estoque} funcionario={funcs.find((f) => f.id === editando)} onFim={salvo} onVoltar={() => setEditando(undefined)} />;
  }

  type Linha = { id: string; titulo: string; subtitulo: string; ativo: boolean };
  const linhas: Linha[] = aba === 'itens'
    ? itens.map((i) => ({ id: i.id, titulo: i.nome, ativo: i.ativo,
      subtitulo: `${i.unidade}${i.embalagem ? ` · ${i.embalagem.nome} com ${i.embalagem.fator}` : ''} · mínimo ${formatarNumero(i.estoqueMinimo)}` }))
    : aba === 'locais'
      ? locais.map((l) => ({ id: l.id, titulo: l.nome, subtitulo: l.centroCusto, ativo: l.ativo }))
      : funcs.map((f) => ({ id: f.id, titulo: f.nome, subtitulo: '', ativo: f.ativo }));

  async function importar() {
    try {
      const n = await estoque.importarItensIniciais();
      setMsg(`${n} itens importados da planilha.`);
      setRecarregar((x) => x + 1);
      onAlterou?.();
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <FlatList
      data={filtrar(linhas, busca, (l) => `${l.titulo} ${l.subtitulo}`)}
      keyExtractor={(l) => l.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={estilos.conteudo}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Chips prefixo="aba" valor={aba} onMudar={(a) => { setAba(a); setBusca(''); }}
            opcoes={[{ id: 'itens', titulo: 'Itens' }, { id: 'locais', titulo: 'Frentes de serviço' }, { id: 'funcionarios', titulo: 'Funcionários' }]} />
          {aba === 'itens' && itens.length === 0 && (
            <Cartao>
              <Text style={estilos.subtitulo}>Nenhum item cadastrado. Importe a lista da planilha do galpão (45 itens, com o valor de referência de cada um).</Text>
              <Botao testID="importar" titulo="Importar lista da planilha" onPress={() => void importar()} />
            </Cartao>
          )}
          <Mensagem ok={msg} />
          <Botao testID="novo" titulo={aba === 'itens' ? '+ Novo item' : aba === 'locais' ? '+ Nova frente de serviço' : '+ Novo funcionário'} onPress={() => setEditando('novo')} />
          <TextInput testID="busca" style={estilos.entrada} placeholder="Buscar…" value={busca} onChangeText={setBusca} />
        </View>
      }
      ListEmptyComponent={<Text style={estilos.subtitulo}>Nada cadastrado.</Text>}
      renderItem={({ item: l }) => (
        <Pressable testID={`cadastro-${l.id}`} onPress={() => setEditando(l.id)} style={[estilos.card, !l.ativo && { opacity: 0.5 }]}>
          <Text style={estilos.titulo}>{l.titulo}</Text>
          {!!l.subtitulo && <Text style={estilos.subtitulo}>{l.subtitulo}</Text>}
          {!l.ativo && <Text style={estilos.subtitulo}>Desativado</Text>}
        </Pressable>
      )}
    />
  );
}

function Ativo({ valor, onMudar }: { valor: boolean; onMudar: (v: boolean) => void }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.titulo}>Ativo</Text>
      <Switch testID="ativo" value={valor} onValueChange={onMudar} />
    </View>
  );
}

function Rodape({ erro, onSalvar, onVoltar }: { erro?: string; onSalvar: () => void; onVoltar: () => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Mensagem erro={erro} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Botao testID="desistir" titulo="Voltar" secundario onPress={onVoltar} />
        <Botao testID="salvar-cadastro" titulo="Salvar" onPress={onSalvar} />
      </View>
    </View>
  );
}

function FormItem({ estoque, item, onFim, onVoltar }: { estoque: Estoque; item?: Item; onFim: () => void; onVoltar: () => void }) {
  const [nome, setNome] = useState(item?.nome ?? '');
  const [unidade, setUnidade] = useState(item?.unidade ?? 'un');
  const [temEmb, setTemEmb] = useState(!!item?.embalagem);
  const [embNome, setEmbNome] = useState(item?.embalagem?.nome ?? 'cx');
  const [embFator, setEmbFator] = useState(item?.embalagem ? String(item.embalagem.fator) : '');
  const [minimo, setMinimo] = useState(item ? String(item.estoqueMinimo).replace('.', ',') : '0');
  const [custoRef, setCustoRef] = useState(item?.custoReferencia !== undefined ? String(item.custoReferencia).replace('.', ',') : '');
  const [ativo, setAtivo] = useState(item?.ativo ?? true);
  const [erro, setErro] = useState<string>();

  async function salvar() {
    setErro(undefined);
    try {
      const fator = lerNumero(embFator);
      const min = lerNumero(minimo);
      if (min === undefined) throw new Error('Estoque mínimo inválido');
      const ref = lerNumero(custoRef);
      await estoque.salvarItem({
        id: item?.id, nome, unidade, estoqueMinimo: min, ativo,
        ...(temEmb ? { embalagem: { nome: embNome.trim(), fator: fator ?? 0 } } : {}),
        ...(ref !== undefined ? { custoReferencia: ref } : {}),
      });
      onFim();
    } catch (e) { setErro((e as Error).message); }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.conteudo}>
        <Cartao>
          <Text style={estilos.titulo}>{item ? 'Editar item' : 'Novo item'}</Text>
          <Text style={estilos.subtitulo}>Cada tamanho de embalagem é um item (ex.: massa 18 L e massa 25 kg são itens diferentes).</Text>
          <Campo testID="nome" rotulo="Nome" value={nome} onChangeText={setNome} autoCapitalize="characters" />
          <Text style={estilos.rotulo}>Unidade de controle do saldo</Text>
          <Chips prefixo="unidade" valor={unidade} onMudar={setUnidade} opcoes={[...new Set([...UNIDADES, unidade])].map((u) => ({ id: u, titulo: u }))} />
          <View style={estilos.linha}>
            <Text style={[estilos.titulo, { flex: 1 }]}>Também entra/sai em embalagem fechada (ex.: caixa com 11 peças)</Text>
            <Switch testID="tem-embalagem" value={temEmb} onValueChange={setTemEmb} />
          </View>
          {temEmb && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Campo testID="emb-nome" rotulo="Embalagem" value={embNome} onChangeText={setEmbNome} style={{ flex: 1 }} />
              <Campo testID="emb-fator" rotulo={`Quantos ${unidade} por embalagem`} value={embFator} onChangeText={setEmbFator} keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Campo testID="minimo" rotulo={`Estoque mínimo (${unidade})`} value={minimo} onChangeText={setMinimo} keyboardType="decimal-pad" style={{ flex: 1 }} />
            <Campo testID="custo-ref" rotulo={`Custo de referência (R$/${unidade})`} value={custoRef} onChangeText={setCustoRef} keyboardType="decimal-pad" style={{ flex: 1 }} />
          </View>
          {item?.custoReferencia !== undefined && <Text style={estilos.subtitulo}>{`Usado na contagem inicial: ${formatarMoeda(item.custoReferencia)}`}</Text>}
          <Ativo valor={ativo} onMudar={setAtivo} />
          <Rodape erro={erro} onSalvar={() => void salvar()} onVoltar={onVoltar} />
        </Cartao>
    </ScrollView>
  );
}

function FormLocal({ estoque, local, centros, onFim, onVoltar }: { estoque: Estoque; local?: Local; centros: string[]; onFim: () => void; onVoltar: () => void }) {
  const [nome, setNome] = useState(local?.nome ?? '');
  const [centro, setCentro] = useState(local?.centroCusto ?? '');
  const [ativo, setAtivo] = useState(local?.ativo ?? true);
  const [erro, setErro] = useState<string>();
  async function salvar() {
    setErro(undefined);
    try { await estoque.salvarLocal({ id: local?.id, nome, centroCusto: centro, ativo }); onFim(); } catch (e) { setErro((e as Error).message); }
  }
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.conteudo}>
        <Cartao>
          <Text style={estilos.titulo}>{local ? 'Editar frente de serviço' : 'Nova frente de serviço'}</Text>
          <Campo testID="centro" rotulo="Centro de custo (contrato)" value={centro} onChangeText={setCentro} placeholder="Ex.: Escritórios da RMG" />
          {centros.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {centros.map((c) => (
                <Pressable key={c} testID={`centro-${c}`} onPress={() => setCentro(c)} style={[estilos.chip, centro === c && estilos.chipAtivo]}>
                  <Text style={[estilos.chipTexto, centro === c && estilos.chipTextoAtivo]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Campo testID="nome" rotulo="Frente de serviço (local)" value={nome} onChangeText={setNome} placeholder="Ex.: Riachuelo" />
          <Ativo valor={ativo} onMudar={setAtivo} />
          <Rodape erro={erro} onSalvar={() => void salvar()} onVoltar={onVoltar} />
        </Cartao>
    </ScrollView>
  );
}

function FormFuncionario({ estoque, funcionario, onFim, onVoltar }: { estoque: Estoque; funcionario?: Funcionario; onFim: () => void; onVoltar: () => void }) {
  const [nome, setNome] = useState(funcionario?.nome ?? '');
  const [ativo, setAtivo] = useState(funcionario?.ativo ?? true);
  const [erro, setErro] = useState<string>();
  async function salvar() {
    setErro(undefined);
    try { await estoque.salvarFuncionario({ id: funcionario?.id, nome, ativo }); onFim(); } catch (e) { setErro((e as Error).message); }
  }
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.conteudo}>
        <Cartao>
          <Text style={estilos.titulo}>{funcionario ? 'Editar funcionário' : 'Novo funcionário'}</Text>
          <Campo testID="nome" rotulo="Nome" value={nome} onChangeText={setNome} />
          <Ativo valor={ativo} onMudar={setAtivo} />
          <Rodape erro={erro} onSalvar={() => void salvar()} onVoltar={onVoltar} />
        </Cartao>
    </ScrollView>
  );
}
