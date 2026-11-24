import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import type { Financeiro, FrentesSemCentro } from '../dados/financeiro';
import { formatarDocumento, lerChavePix, NOME_TIPO_CHAVE } from '../domain/nomes';
import {
  DIAS_SEMANA, FORMAS_PAGAMENTO, type CentroCusto, type CentroEspecial, type ContaBancaria, type DiaSemana, type Empresa, type FormaPagamento,
  type Fornecedor, type Local, type TipoDespesa,
} from '../domain/tipos';
import { Botao, Campo, Cartao, Chips, filtrar, Mensagem, Seletor } from './componentes';
import { cores, estilos } from './estilos';
import { ImportarFinanceiroTela } from './ImportarFinanceiroTela';

export type AbaFinanceiro = 'empresas' | 'centros' | 'fornecedores' | 'tipos' | 'importar';

interface Dados {
  empresas: Empresa[]; contas: ContaBancaria[]; centros: CentroCusto[]; frentes: Local[]; fornecedores: Fornecedor[]; tipos: TipoDespesa[];
  semCentro: FrentesSemCentro[];
}
const VAZIO: Dados = { empresas: [], contas: [], centros: [], frentes: [], fornecedores: [], tipos: [], semCentro: [] };

const NOME_ESPECIAL: Record<CentroEspecial, string> = { administracao: 'Administração (rateado entre as obras)', galpao: 'Estoque/Galpão' };
const nomeForma = (f: FormaPagamento) => FORMAS_PAGAMENTO.find((x) => x.id === f)!.titulo;
const lerLista = (s: string) => s.split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
const descreverPix = (c?: string) => { if (!c) return ''; try { return `Pix (${NOME_TIPO_CHAVE[lerChavePix(c).tipo]}): ${c}`; } catch { return `Pix: ${c}`; } };

type Edicao =
  | { tipo: 'empresa'; id?: string }
  | { tipo: 'conta'; id?: string; empresaId: string }
  | { tipo: 'centro'; id?: string }
  | { tipo: 'frente'; id?: string; centroId: string }
  | { tipo: 'fornecedor'; id?: string }
  | { tipo: 'tipo'; id?: string };

interface Props {
  financeiro: Financeiro; versao?: number; onAlterou?: () => void; abaInicial?: AbaFinanceiro;
  /** Abre o seletor de arquivos (importação da planilha de cadastros). */
  escolherPlanilha?: () => Promise<Uint8Array | undefined>;
}

/** Cadastros do financeiro. Todos do financeiro consultam; só o administrador altera. */
export function FinanceiroTela({ financeiro, versao = 0, onAlterou, abaInicial = 'empresas', escolherPlanilha }: Props) {
  const [aba, setAba] = useState<AbaFinanceiro>(abaInicial);
  const [d, setD] = useState<Dados>(VAZIO);
  const [edicao, setEdicao] = useState<Edicao>();
  const [recarregar, setRecarregar] = useState(0);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string }>({});
  const [busca, setBusca] = useState('');
  const pode = financeiro.podeEditar;

  useEffect(() => {
    void Promise.all([
      financeiro.empresas(true), financeiro.contas(true), financeiro.centros(true), financeiro.frentes(true),
      financeiro.fornecedores(true), financeiro.tipos(true), financeiro.frentesSemCentro(),
    ]).then(([empresas, contas, centros, frentes, fornecedores, tipos, semCentro]) => setD({ empresas, contas, centros, frentes, fornecedores, tipos, semCentro }));
  }, [financeiro, versao, recarregar]);

  const atualizar = (ok?: string) => { setEdicao(undefined); setRecarregar((n) => n + 1); setMsg({ ok }); onAlterou?.(); };
  const empresa = (id: string) => d.empresas.find((e) => e.id === id);

  if (edicao) {
    const voltar = () => setEdicao(undefined);
    if (edicao.tipo === 'empresa') return <FormEmpresa financeiro={financeiro} empresa={empresa(edicao.id ?? '')} onFim={atualizar} onVoltar={voltar} />;
    if (edicao.tipo === 'conta') return <FormConta financeiro={financeiro} conta={d.contas.find((c) => c.id === edicao.id)} empresa={empresa(edicao.empresaId)!} onFim={atualizar} onVoltar={voltar} />;
    if (edicao.tipo === 'centro') {
      return <FormCentro financeiro={financeiro} centro={d.centros.find((c) => c.id === edicao.id)} empresas={d.empresas.filter((e) => e.ativo)}
        frentes={d.frentes.filter((f) => f.centroId && f.centroId === edicao.id)} onFrente={(id) => setEdicao({ tipo: 'frente', id, centroId: edicao.id! })} onFim={atualizar} onVoltar={voltar} />;
    }
    if (edicao.tipo === 'frente') {
      return <FormFrente financeiro={financeiro} frente={d.frentes.find((f) => f.id === edicao.id)} centro={d.centros.find((c) => c.id === edicao.centroId)!}
        onFim={() => { setRecarregar((n) => n + 1); onAlterou?.(); setEdicao({ tipo: 'centro', id: edicao.centroId }); }} onVoltar={() => setEdicao({ tipo: 'centro', id: edicao.centroId })} />;
    }
    if (edicao.tipo === 'fornecedor') return <FormFornecedor financeiro={financeiro} fornecedor={d.fornecedores.find((f) => f.id === edicao.id)} onFim={atualizar} onVoltar={voltar} />;
    return <FormTipo financeiro={financeiro} tipo={d.tipos.find((t) => t.id === edicao.id)} onFim={atualizar} onVoltar={voltar} />;
  }

  async function iniciais() {
    try {
      const r = await financeiro.criarCadastrosIniciais();
      atualizar(`Criados: ${r.empresas} empresas, ${r.contas} contas, ${r.centros} centros de custo e ${r.tipos} tipos de despesa.`);
    } catch (e) { setMsg({ erro: (e as Error).message }); }
  }

  const cabecalho = (
    <View style={{ gap: 12 }}>
      <Chips prefixo="fin" valor={aba} onMudar={(a) => { setAba(a); setBusca(''); setMsg({}); }} opcoes={[
        { id: 'empresas', titulo: 'Empresas e contas' }, { id: 'centros', titulo: 'Centros de custo' },
        { id: 'fornecedores', titulo: 'Fornecedores' }, { id: 'tipos', titulo: 'Tipos de despesa' },
        ...(pode && escolherPlanilha ? [{ id: 'importar' as const, titulo: 'Importar planilha' }] : []),
      ]} />
      {!pode && <Text style={estilos.subtitulo}>Consulta. Só o administrador do financeiro altera os cadastros.</Text>}
      {pode && d.empresas.length === 0 && (
        <Cartao>
          <Text style={estilos.titulo}>Começar</Text>
          <Text style={estilos.subtitulo}>Cria ALN e Passos com as contas informadas (ALN: BB e Inter; Passos: BB, Itaú, Inter e Nubank), os centros Administração e Estoque/Galpão (um de cada, para as duas empresas) e a lista de tipos de despesa. Depois é só completar CNPJ, agência e conta.</Text>
          <Botao testID="iniciais" titulo="Criar cadastros iniciais" onPress={() => void iniciais()} />
        </Cartao>
      )}
      <Mensagem ok={msg.ok} erro={msg.erro} />
    </View>
  );

  if (aba === 'importar' && escolherPlanilha) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ padding: 16, paddingBottom: 0 }}>{cabecalho}</View>
        <ImportarFinanceiroTela financeiro={financeiro} escolherArquivo={escolherPlanilha} onAlterou={() => atualizar()} />
      </View>
    );
  }

  if (aba === 'empresas') {
    return (
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        {cabecalho}
        {pode && <Botao testID="nova-empresa" titulo="+ Nova empresa" onPress={() => setEdicao({ tipo: 'empresa' })} />}
        {d.empresas.map((e) => (
          <Cartao key={e.id}>
            <Pressable testID={`empresa-${e.id}`} disabled={!pode} onPress={() => setEdicao({ tipo: 'empresa', id: e.id })} style={!e.ativo && { opacity: 0.5 }}>
              <Text style={estilos.titulo}>{e.apelido}</Text>
              <Text style={estilos.subtitulo}>{`${e.nome}${e.cnpj ? ` · CNPJ ${formatarDocumento(e.cnpj)}` : ' · CNPJ não informado'}`}</Text>
            </Pressable>
            <Text style={estilos.secao}>Contas bancárias</Text>
            {d.contas.filter((c) => c.empresaId === e.id).map((c) => (
              <Pressable key={c.id} testID={`conta-${c.id}`} disabled={!pode} onPress={() => setEdicao({ tipo: 'conta', id: c.id, empresaId: e.id })}
                style={[estilos.linha, !c.ativo && { opacity: 0.5 }]}>
                <Text style={estilos.valor}>{c.apelido}</Text>
                <Text style={estilos.subtitulo}>{[c.agencia && `ag. ${c.agencia}`, c.numero && `cc ${c.numero}`].filter(Boolean).join(' · ') || 'agência e conta não informadas'}</Text>
              </Pressable>
            ))}
            {pode && <Botao testID={`nova-conta-${e.id}`} titulo="+ Conta" secundario onPress={() => setEdicao({ tipo: 'conta', empresaId: e.id })} />}
          </Cartao>
        ))}
      </ScrollView>
    );
  }

  if (aba === 'centros') {
    return (
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        {cabecalho}
        {pode && d.semCentro.map((g) => <LigarFrentes key={g.texto} financeiro={financeiro} grupo={g} centros={d.centros.filter((c) => c.ativo)} onFim={atualizar} />)}
        {pode && <Botao testID="novo-centro" titulo="+ Novo centro de custo" onPress={() => setEdicao({ tipo: 'centro' })} />}
        {([['Obras e contratos', (c: CentroCusto) => !c.especial && c.ativo], ['Administração e galpão', (c: CentroCusto) => !!c.especial && c.ativo],
          ['Parados (desativados)', (c: CentroCusto) => !c.ativo]] as const).map(([titulo, filtro]) => {
          const centros = d.centros.filter(filtro);
          if (!centros.length) return null;
          return (
            <View key={titulo} style={{ gap: 8 }}>
              <Text style={estilos.secao}>{titulo}</Text>
              {centros.map((c) => {
                const frentes = d.frentes.filter((f) => f.centroId === c.id && f.ativo);
                const emp = c.empresaId ? empresa(c.empresaId) : undefined;
                return (
                  <Pressable key={c.id} testID={`centro-${c.id}`} onPress={() => setEdicao({ tipo: 'centro', id: c.id })} style={[estilos.card, !c.ativo && { opacity: 0.6 }]}>
                    <Text style={estilos.titulo}>{c.nome}</Text>
                    {c.especial && <Text style={estilos.etiqueta}>{NOME_ESPECIAL[c.especial]}</Text>}
                    {emp && <Text style={estilos.subtitulo}>{`Contrato da ${emp.apelido}`}</Text>}
                    <Text style={estilos.subtitulo}>{frentes.length ? `${frentes.length} ${frentes.length === 1 ? 'frente' : 'frentes'}: ${frentes.map((f) => f.nome).join(', ')}` : 'Sem frentes'}</Text>
                    {c.apelidos.length > 0 && <Text style={estilos.subtitulo}>{`Outros nomes: ${c.apelidos.join('; ')}`}</Text>}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    );
  }

  if (aba === 'fornecedores') {
    return (
      <FlatList data={filtrar(d.fornecedores, busca, (f) => `${f.nome} ${f.documento ?? ''} ${f.apelidos.join(' ')}`)} keyExtractor={(f) => f.id}
        contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {cabecalho}
            {pode && <Botao testID="novo-fornecedor" titulo="+ Novo fornecedor" onPress={() => setEdicao({ tipo: 'fornecedor' })} />}
            <TextInput testID="busca" style={estilos.entrada} placeholder="Buscar por nome ou CNPJ…" value={busca} onChangeText={setBusca} />
          </View>
        }
        ListEmptyComponent={<Text style={estilos.subtitulo}>Nenhum fornecedor.</Text>}
        renderItem={({ item: f }) => (
          <Pressable testID={`fornecedor-${f.id}`} disabled={!pode} onPress={() => setEdicao({ tipo: 'fornecedor', id: f.id })} style={[estilos.card, !f.ativo && { opacity: 0.5 }]}>
            <Text style={estilos.titulo}>{f.nome}</Text>
            <Text style={estilos.subtitulo}>{[f.documento && formatarDocumento(f.documento), nomeForma(f.forma), f.diaFechamento && `fecha ${DIAS_SEMANA.find((x) => x.id === f.diaFechamento)!.titulo.toLowerCase()}`].filter(Boolean).join(' · ')}</Text>
            {!!f.chavePix && <Text style={estilos.subtitulo}>{descreverPix(f.chavePix)}</Text>}
          </Pressable>
        )} />
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      {cabecalho}
      {pode && <Botao testID="novo-tipo" titulo="+ Novo tipo de despesa" onPress={() => setEdicao({ tipo: 'tipo' })} />}
      {d.tipos.map((t) => (
        <Pressable key={t.id} testID={`tipo-${t.id}`} disabled={!pode} onPress={() => setEdicao({ tipo: 'tipo', id: t.id })} style={[estilos.card, !t.ativo && { opacity: 0.5 }]}>
          <Text style={estilos.titulo}>{t.nome}</Text>
          {t.apelidos.length > 0 && <Text style={estilos.subtitulo}>{`Também aceita: ${t.apelidos.join('; ')}`}</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Frentes do estoque cadastradas com um contrato que ainda não é centro de custo. */
function LigarFrentes({ financeiro, grupo, centros, onFim }: {
  financeiro: Financeiro; grupo: FrentesSemCentro; centros: CentroCusto[]; onFim: (ok?: string) => void;
}) {
  const [centroId, setCentroId] = useState<string>();
  const [erro, setErro] = useState<string>();
  async function ligar(id: string) {
    const n = await financeiro.vincularFrentes(grupo.texto, id);
    onFim(`${n} ${n === 1 ? 'frente ligada' : 'frentes ligadas'} ao centro de custo.`);
  }
  async function criar() {
    setErro(undefined);
    try {
      const c = await financeiro.salvarCentro({ nome: grupo.texto, ativo: true });
      await ligar(c.id);
    } catch (e) { setErro((e as Error).message); }
  }
  return (
    <Cartao>
      <Text style={[estilos.titulo, { color: cores.aviso }]}>{`Contrato do estoque sem centro de custo: ${grupo.texto}`}</Text>
      <Text style={estilos.subtitulo}>{`Frentes: ${grupo.frentes.map((f) => f.nome).join(', ')}`}</Text>
      {centros.length > 0 && (
        <>
          <Seletor testID={`ligar-${grupo.texto}`} rotulo="Ligar a um centro existente" valor={centroId} onEscolher={setCentroId}
            opcoes={centros.map((c) => ({ id: c.id, titulo: c.nome }))} />
          {centroId && <Botao testID={`confirmar-ligar-${grupo.texto}`} titulo="Ligar" onPress={() => void ligar(centroId)} />}
        </>
      )}
      <Botao testID={`criar-centro-${grupo.texto}`} titulo={`Criar o centro "${grupo.texto}" e ligar`} secundario onPress={() => void criar()} />
      <Mensagem erro={erro} />
    </Cartao>
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

/** Formulário com tratamento de erro comum. */
function useSalvar(acao: () => Promise<unknown>, onFim: () => void) {
  const [erro, setErro] = useState<string>();
  return { erro, salvar: () => { setErro(undefined); acao().then(() => onFim(), (e: Error) => setErro(e.message)); } };
}

function FormEmpresa({ financeiro, empresa, onFim, onVoltar }: { financeiro: Financeiro; empresa?: Empresa; onFim: () => void; onVoltar: () => void }) {
  const [apelido, setApelido] = useState(empresa?.apelido ?? '');
  const [nome, setNome] = useState(empresa?.nome ?? '');
  const [cnpj, setCnpj] = useState(formatarDocumento(empresa?.cnpj));
  const [ativo, setAtivo] = useState(empresa?.ativo ?? true);
  const { erro, salvar } = useSalvar(() => financeiro.salvarEmpresa({ id: empresa?.id, apelido, nome, cnpj, ativo }), onFim);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.conteudo}>
      <Cartao>
        <Text style={estilos.titulo}>{empresa ? 'Editar empresa' : 'Nova empresa'}</Text>
        <Campo testID="apelido" rotulo="Nome curto (usado nas telas)" value={apelido} onChangeText={setApelido} placeholder="Ex.: ALN" />
        <Campo testID="nome" rotulo="Razão social" value={nome} onChangeText={setNome} />
        <Campo testID="cnpj" rotulo="CNPJ" value={cnpj} onChangeText={setCnpj} keyboardType="numbers-and-punctuation" placeholder="00.000.000/0000-00" />
        <Ativo valor={ativo} onMudar={setAtivo} />
        <Rodape erro={erro} onSalvar={salvar} onVoltar={onVoltar} />
      </Cartao>
    </ScrollView>
  );
}

function FormConta({ financeiro, conta, empresa, onFim, onVoltar }: { financeiro: Financeiro; conta?: ContaBancaria; empresa: Empresa; onFim: () => void; onVoltar: () => void }) {
  const [banco, setBanco] = useState(conta?.banco ?? '');
  const [agencia, setAgencia] = useState(conta?.agencia ?? '');
  const [numero, setNumero] = useState(conta?.numero ?? '');
  const [apelido, setApelido] = useState(conta?.apelido ?? '');
  const [ativo, setAtivo] = useState(conta?.ativo ?? true);
  const { erro, salvar } = useSalvar(() => financeiro.salvarConta({ id: conta?.id, empresaId: empresa.id, banco, agencia, numero, apelido, ativo }), onFim);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.conteudo}>
      <Cartao>
        <Text style={estilos.titulo}>{`${conta ? 'Editar conta' : 'Nova conta'} · ${empresa.apelido}`}</Text>
        <Campo testID="banco" rotulo="Banco" value={banco} onChangeText={setBanco} placeholder="Ex.: Banco do Brasil" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Campo testID="agencia" rotulo="Agência" value={agencia} onChangeText={setAgencia} style={{ flex: 1 }} />
          <Campo testID="numero" rotulo="Conta" value={numero} onChangeText={setNumero} style={{ flex: 1 }} />
        </View>
        <Campo testID="apelido" rotulo="Nome da conta nas telas" value={apelido} onChangeText={setApelido} placeholder={`Em branco: ${banco || 'banco'} ${empresa.apelido}`} />
        <Ativo valor={ativo} onMudar={setAtivo} />
        <Rodape erro={erro} onSalvar={salvar} onVoltar={onVoltar} />
      </Cartao>
    </ScrollView>
  );
}

function FormCentro({ financeiro, centro, empresas, frentes, onFrente, onFim, onVoltar }: {
  financeiro: Financeiro; centro?: CentroCusto; empresas: Empresa[]; frentes: Local[]; onFrente: (id?: string) => void; onFim: () => void; onVoltar: () => void;
}) {
  const pode = financeiro.podeEditar;
  const [nome, setNome] = useState(centro?.nome ?? '');
  const [empresaId, setEmpresaId] = useState(centro?.empresaId ?? '');
  const [especial, setEspecial] = useState<CentroEspecial | 'obra'>(centro?.especial ?? 'obra');
  const [apelidos, setApelidos] = useState((centro?.apelidos ?? []).join('; '));
  const [ativo, setAtivo] = useState(centro?.ativo ?? true);
  const { erro, salvar } = useSalvar(() => financeiro.salvarCentro({
    id: centro?.id, nome, apelidos: lerLista(apelidos), ativo, ...(empresaId ? { empresaId } : {}), ...(especial !== 'obra' ? { especial } : {}),
  }), onFim);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.conteudo}>
      <Cartao>
        <Text style={estilos.titulo}>{centro ? (pode ? 'Editar centro de custo' : centro.nome) : 'Novo centro de custo'}</Text>
        {pode && (
          <>
            <Campo testID="nome" rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Ex.: RMG Água" />
            <Text style={estilos.rotulo}>Empresa do contrato (opcional; qualquer empresa pode pagar custos deste centro)</Text>
            <Chips prefixo="empresa" valor={empresaId} onMudar={setEmpresaId} opcoes={[{ id: '', titulo: 'Não informar' }, ...empresas.map((e) => ({ id: e.id, titulo: e.apelido }))]} />
            <Text style={estilos.rotulo}>Tipo</Text>
            <Chips prefixo="especial" valor={especial} onMudar={setEspecial} opcoes={[
              { id: 'obra', titulo: 'Obra/contrato' }, { id: 'administracao', titulo: 'Administração' }, { id: 'galpao', titulo: 'Estoque/Galpão' },
            ]} />
            <Campo testID="apelidos" rotulo="Outros nomes usados nas planilhas (separe com ;)" value={apelidos} onChangeText={setApelidos} placeholder="Ex.: RMG AGUA; CAIXA RMG" multiline />
            <Ativo valor={ativo} onMudar={setAtivo} />
            {!ativo && <Text style={estilos.subtitulo}>Desativado = parado. Continua nos relatórios antigos e pode voltar a qualquer momento.</Text>}
            <Rodape erro={erro} onSalvar={salvar} onVoltar={onVoltar} />
          </>
        )}
        {!pode && <Botao testID="desistir" titulo="Voltar" secundario onPress={onVoltar} />}
      </Cartao>
      {centro && (
        <Cartao>
          <Text style={estilos.titulo}>Frentes de serviço</Text>
          {frentes.length === 0 && <Text style={estilos.subtitulo}>Nenhuma frente neste centro.</Text>}
          {frentes.map((f) => (
            <Pressable key={f.id} testID={`frente-${f.id}`} disabled={!pode} onPress={() => onFrente(f.id)} style={[estilos.linha, !f.ativo && { opacity: 0.5 }]}>
              <Text style={estilos.valor}>{f.nome}</Text>
              {!f.ativo && <Text style={estilos.subtitulo}>desativada</Text>}
            </Pressable>
          ))}
          {pode && <Botao testID="nova-frente" titulo="+ Frente de serviço" secundario onPress={() => onFrente(undefined)} />}
        </Cartao>
      )}
    </ScrollView>
  );
}

function FormFrente({ financeiro, frente, centro, onFim, onVoltar }: { financeiro: Financeiro; frente?: Local; centro: CentroCusto; onFim: () => void; onVoltar: () => void }) {
  const [nome, setNome] = useState(frente?.nome ?? '');
  const [ativo, setAtivo] = useState(frente?.ativo ?? true);
  const { erro, salvar } = useSalvar(() => financeiro.salvarFrente({ id: frente?.id, nome, centroId: centro.id, ativo }), onFim);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.conteudo}>
      <Cartao>
        <Text style={estilos.titulo}>{`${frente ? 'Editar frente' : 'Nova frente'} · ${centro.nome}`}</Text>
        <Text style={estilos.subtitulo}>A frente também aparece no estoque (saídas de material para a obra).</Text>
        <Campo testID="nome" rotulo="Frente de serviço" value={nome} onChangeText={setNome} placeholder="Ex.: RMG Pureza" />
        <Ativo valor={ativo} onMudar={setAtivo} />
        <Rodape erro={erro} onSalvar={salvar} onVoltar={onVoltar} />
      </Cartao>
    </ScrollView>
  );
}

function FormFornecedor({ financeiro, fornecedor, onFim, onVoltar }: { financeiro: Financeiro; fornecedor?: Fornecedor; onFim: () => void; onVoltar: () => void }) {
  const [nome, setNome] = useState(fornecedor?.nome ?? '');
  const [documento, setDocumento] = useState(formatarDocumento(fornecedor?.documento));
  const [pix, setPix] = useState(fornecedor?.chavePix ?? '');
  const [forma, setForma] = useState<FormaPagamento>(fornecedor?.forma ?? 'pix');
  const [dia, setDia] = useState<DiaSemana | ''>(fornecedor?.diaFechamento ?? '');
  const [obs, setObs] = useState(fornecedor?.observacao ?? '');
  const [apelidos, setApelidos] = useState((fornecedor?.apelidos ?? []).join('; '));
  const [ativo, setAtivo] = useState(fornecedor?.ativo ?? true);
  const { erro, salvar } = useSalvar(() => financeiro.salvarFornecedor({
    id: fornecedor?.id, nome, documento, chavePix: pix, forma, observacao: obs, apelidos: lerLista(apelidos), ativo, ...(dia ? { diaFechamento: dia } : {}),
  }), onFim);
  let tipoPix = '';
  try { if (pix.trim()) tipoPix = `Chave do tipo ${NOME_TIPO_CHAVE[lerChavePix(pix).tipo]}`; } catch (e) { tipoPix = (e as Error).message; }
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.conteudo}>
      <Cartao>
        <Text style={estilos.titulo}>{fornecedor ? 'Editar fornecedor' : 'Novo fornecedor'}</Text>
        <Campo testID="nome" rotulo="Nome" value={nome} onChangeText={setNome} placeholder="Ex.: Aço Potiguar" />
        <Campo testID="documento" rotulo="CPF ou CNPJ" value={documento} onChangeText={setDocumento} keyboardType="numbers-and-punctuation" />
        <Text style={estilos.rotulo}>Forma de pagamento</Text>
        <Chips prefixo="forma" valor={forma} onMudar={setForma} opcoes={FORMAS_PAGAMENTO} />
        {forma === 'fatura' && (
          <>
            <Text style={estilos.rotulo}>Dia em que a loja fecha a fatura</Text>
            <Chips prefixo="dia" valor={dia} onMudar={setDia} opcoes={DIAS_SEMANA} />
          </>
        )}
        <Campo testID="pix" rotulo={forma === 'pix' ? 'Chave Pix' : 'Chave Pix (opcional)'} value={pix} onChangeText={setPix} autoCapitalize="none" />
        {!!tipoPix && <Text style={estilos.subtitulo}>{tipoPix}</Text>}
        <Campo testID="apelidos" rotulo="Outros nomes (separe com ;)" value={apelidos} onChangeText={setApelidos} />
        <Campo testID="obs" rotulo="Observação" value={obs} onChangeText={setObs} multiline />
        <Ativo valor={ativo} onMudar={setAtivo} />
        <Rodape erro={erro} onSalvar={salvar} onVoltar={onVoltar} />
      </Cartao>
    </ScrollView>
  );
}

function FormTipo({ financeiro, tipo, onFim, onVoltar }: { financeiro: Financeiro; tipo?: TipoDespesa; onFim: () => void; onVoltar: () => void }) {
  const [nome, setNome] = useState(tipo?.nome ?? '');
  const [apelidos, setApelidos] = useState((tipo?.apelidos ?? []).join('; '));
  const [ativo, setAtivo] = useState(tipo?.ativo ?? true);
  const { erro, salvar } = useSalvar(() => financeiro.salvarTipo({ id: tipo?.id, nome, apelidos: lerLista(apelidos), ativo }), onFim);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={estilos.conteudo}>
      <Cartao>
        <Text style={estilos.titulo}>{tipo ? 'Editar tipo de despesa' : 'Novo tipo de despesa'}</Text>
        <Campo testID="nome" rotulo="Nome" value={nome} onChangeText={setNome} />
        <Campo testID="apelidos" rotulo="Outros nomes usados nas planilhas (separe com ;)" value={apelidos} onChangeText={setApelidos} />
        <Text style={estilos.subtitulo}>Acentos, maiúsculas e plural já são ignorados (SALARIO = Salário, FERRAMENTAS = Ferramenta).</Text>
        <Ativo valor={ativo} onMudar={setAtivo} />
        <Rodape erro={erro} onSalvar={salvar} onVoltar={onVoltar} />
      </Cartao>
    </ScrollView>
  );
}
