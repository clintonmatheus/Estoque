import { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { analisarDataBR, formatarDataBR } from '../domain/datas';
import { lerNumero } from '../domain/formato';
import type { Bem, Funcionario, Local, Posse } from '../domain/tipos';
import { Botao, Campo, Cartao, Chips, Mensagem, Seletor } from './componentes';
import { estilos } from './estilos';

const dataOpcional = (t: string) => (t.trim() ? analisarDataBR(t) : undefined);

/** Seletor "onde está": galpão ou com uma pessoa em uma frente de serviço. */
export function EscolhaPosse({ prefixo, valor, onMudar, funcionarios, locais, rotulo = 'Onde está' }: {
  prefixo: string; valor: Posse | undefined; onMudar: (p: Posse | undefined) => void; funcionarios: Funcionario[]; locais: Local[]; rotulo?: string;
}) {
  const [local, setLocal] = useState<string | undefined>(valor?.tipo === 'campo' ? valor.localId : undefined);
  const [func, setFunc] = useState<string | undefined>(valor?.tipo === 'campo' ? valor.funcionarioId : undefined);
  const campo = valor?.tipo === 'campo';
  const atualizar = (f?: string, l?: string) => { setFunc(f); setLocal(l); onMudar(f && l ? { tipo: 'campo', funcionarioId: f, localId: l } : undefined); };
  return (
    <View style={{ gap: 8 }}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Chips prefixo={`${prefixo}-onde`} valor={valor?.tipo === 'galpao' ? 'galpao' : 'campo'} onMudar={(v) => (v === 'galpao' ? onMudar({ tipo: 'galpao' }) : atualizar(func, local))}
        opcoes={[{ id: 'galpao', titulo: 'No galpão' }, { id: 'campo', titulo: 'Com pessoa em obra' }]} />
      {(campo || (valor === undefined)) && (
        <>
          <Seletor testID={`${prefixo}-pessoa`} rotulo="Com quem (mestre ou encarregado)" valor={func} opcoes={funcionarios.filter((f) => f.ativo).map((f) => ({ id: f.id, titulo: f.nome }))}
            onEscolher={(id) => atualizar(id, local)} />
          <Seletor testID={`${prefixo}-obra`} rotulo="Em qual frente de serviço" valor={local}
            opcoes={locais.filter((l) => l.ativo).map((l) => ({ id: l.id, titulo: l.nome, subtitulo: l.centroCusto }))} onEscolher={(id) => atualizar(func, id)} />
        </>
      )}
    </View>
  );
}

interface Props {
  estoque: Estoque; bem?: Bem; hoje: string; funcionarios: Funcionario[]; locais: Local[]; onFim: (id?: string) => void; onVoltar: () => void;
}

/** Cadastro (e levantamento: já com a posse inicial) de ferramenta ou equipamento locado. */
export function FormBem({ estoque, bem, hoje, funcionarios, locais, onFim, onVoltar }: Props) {
  const [nome, setNome] = useState(bem?.nome ?? '');
  const [codigo, setCodigo] = useState(bem?.codigo ?? '');
  const [tipo, setTipo] = useState<Bem['tipo']>(bem?.tipo ?? 'ferramenta');
  const [controle, setControle] = useState<Bem['controle']>(bem?.controle ?? 'unidade');
  const [ativo, setAtivo] = useState(bem?.ativo ?? true);
  const [obs, setObs] = useState(bem?.observacao ?? '');
  const [qtd, setQtd] = useState('1');
  const [posse, setPosse] = useState<Posse | undefined>({ tipo: 'galpao' });
  const [data, setData] = useState(formatarDataBR(hoje));
  const l = bem?.locacao;
  const [locadora, setLocadora] = useState(l?.locadora ?? '');
  const [contrato, setContrato] = useState(l?.contrato ?? '');
  const [valor, setValor] = useState(l?.valor !== undefined ? String(l.valor).replace('.', ',') : '');
  const [periodo, setPeriodo] = useState<'dia' | 'mes'>(l?.periodo ?? 'mes');
  const [inicio, setInicio] = useState(l?.inicio ? formatarDataBR(l.inicio) : '');
  const [fim, setFim] = useState(l?.prevista ? formatarDataBR(l.prevista) : '');
  const [cobrada, setCobrada] = useState<string | undefined>(l?.localCobrancaId);
  const [erro, setErro] = useState<string>();

  async function salvar() {
    setErro(undefined);
    try {
      let valorNum: number | undefined;
      if (tipo === 'locado' && valor.trim()) {
        valorNum = lerNumero(valor);
        if (valorNum === undefined) throw new Error('Valor inválido');
      }
      const dados = {
        id: bem?.id, nome, codigo, tipo, controle, ativo, observacao: obs,
        ...(tipo === 'locado' ? { locacao: { locadora, contrato, valor: valorNum, periodo, inicio: dataOpcional(inicio), prevista: dataOpcional(fim), localCobrancaId: cobrada } } : {}),
      };
      if (bem) { await estoque.salvarBem(dados); onFim(bem.id); return; }
      if (!posse) throw new Error('Informe com quem e em qual frente de serviço está');
      const q = controle === 'unidade' ? 1 : lerNumero(qtd) ?? NaN;
      const criado = await estoque.cadastrarBem(dados, { posse, quantidade: q, data: analisarDataBR(data) });
      onFim(criado.id);
    } catch (e) { setErro((e as Error).message); }
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.conteudo} automaticallyAdjustKeyboardInsets>
      <Cartao>
        <Text style={estilos.titulo}>{bem ? 'Editar cadastro' : 'Novo cadastro'}</Text>
        <Chips prefixo="bem-tipo" valor={tipo} onMudar={(t) => { setTipo(t); if (!bem && t === 'locado') setControle('quantidade'); }}
          opcoes={[{ id: 'ferramenta', titulo: 'Ferramenta' }, { id: 'locado', titulo: 'Equipamento locado' }]} />
        <Campo testID="bem-nome" rotulo="Nome" value={nome} onChangeText={setNome} placeholder={tipo === 'locado' ? 'Ex.: Escora metálica' : 'Ex.: Furadeira de impacto'} />
        <Campo testID="bem-codigo" rotulo="Número / código da unidade" value={codigo} onChangeText={setCodigo} placeholder="Opcional (ex.: 03)" />
        <Text style={estilos.rotulo}>Como controlar</Text>
        <Chips prefixo="bem-controle" valor={controle} onMudar={setControle}
          opcoes={[{ id: 'unidade', titulo: 'Cada peça (individual)' }, { id: 'quantidade', titulo: 'Por quantidade' }]} />
        <Campo testID="bem-obs" rotulo="Observação" value={obs} onChangeText={setObs} placeholder="Opcional" />
      </Cartao>

      {tipo === 'locado' && (
        <Cartao>
          <Text style={estilos.titulo}>Locação</Text>
          <Campo testID="loc-locadora" rotulo="Locadora" value={locadora} onChangeText={setLocadora} placeholder="Ex.: Agaé Locação" />
          <Campo testID="loc-contrato" rotulo="Nº do contrato" value={contrato} onChangeText={setContrato} placeholder="Opcional" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Campo testID="loc-valor" rotulo="Valor por peça (R$)" value={valor} onChangeText={setValor} keyboardType="decimal-pad" style={{ flex: 1 }} placeholder="Opcional" />
          </View>
          <Chips prefixo="loc-periodo" valor={periodo} onMudar={setPeriodo} opcoes={[{ id: 'dia', titulo: 'Por dia' }, { id: 'mes', titulo: 'Por mês' }]} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Campo testID="loc-inicio" rotulo="Início" value={inicio} onChangeText={setInicio} keyboardType="numbers-and-punctuation" style={{ flex: 1 }} placeholder="dd/mm/aaaa" />
            <Campo testID="loc-fim" rotulo="Fim previsto" value={fim} onChangeText={setFim} keyboardType="numbers-and-punctuation" style={{ flex: 1 }} placeholder="dd/mm/aaaa" />
          </View>
          <Seletor testID="loc-cobrada" rotulo="Obra em que a locadora cobra" valor={cobrada} vazio="Opcional"
            opcoes={locais.filter((x) => x.ativo).map((x) => ({ id: x.id, titulo: x.nome, subtitulo: x.centroCusto }))} onEscolher={setCobrada} />
        </Cartao>
      )}

      {!bem && (
        <Cartao>
          <Text style={estilos.titulo}>Onde está agora</Text>
          {controle === 'quantidade' && <Campo testID="bem-qtd" rotulo="Quantidade de peças" value={qtd} onChangeText={setQtd} keyboardType="number-pad" />}
          <EscolhaPosse prefixo="bem" valor={posse} onMudar={setPosse} funcionarios={funcionarios} locais={locais} rotulo="Posse" />
          <Campo testID="bem-data" rotulo="Desde" value={data} onChangeText={setData} keyboardType="numbers-and-punctuation" />
        </Cartao>
      )}

      {bem && (
        <View style={estilos.linha}>
          <Text style={estilos.titulo}>Ativo</Text>
          <Switch testID="bem-ativo" value={ativo} onValueChange={setAtivo} />
        </View>
      )}
      <Mensagem erro={erro} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Botao testID="bem-voltar" titulo="Voltar" secundario onPress={onVoltar} />
        <Botao testID="bem-salvar" titulo="Salvar" onPress={() => void salvar()} />
      </View>
    </ScrollView>
  );
}
