import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { SaldoSimples } from '../auth/autenticacao';
import type { Estoque, Lancamento } from '../dados/estoque';
import type { Financeiro } from '../dados/financeiro';
import { emPrazo, posicoesDoBem, situacaoLocacao, totalDoBem, divergenciasDeCobranca } from '../domain/bens';
import { epiParaTrocar } from '../domain/epi';
import { podeAprovar } from '../domain/pedidos';
import {
  ehEpi, operaControle, podeConferir, soSaldos, podeLancar, podePagar, temFinanceiro, veEstoque, veFinanceiro,
  type Item, type Movimento, type Usuario,
} from '../domain/tipos';
import type { ServicoFotos } from '../fotos/servico';
import type { EstadoSync } from '../sync/agendador';
import { BarraUsuario, textoSync } from './BarraUsuario';
import { Cabecalho } from './Cabecalho';
import { CadastrosTela } from './CadastrosTela';
import { ConsultaTela } from './ConsultaTela';
import { Cartao, Chips } from './componentes';
import { ComprasTela } from './ComprasTela';
import { EpiTela } from './EpiTela';
import { EquipamentosTela } from './EquipamentosTela';
import { EstoqueTela } from './EstoqueTela';
import { cores, estilos } from './estilos';
import { FinanceiroTela } from './FinanceiroTela';
import { HistoricoTela } from './HistoricoTela';
import { ImportarEpiTela } from './ImportarEpiTela';
import { ImportarTela } from './ImportarTela';
import { InventarioTela } from './InventarioTela';
import { LancamentoTela } from './LancamentoTela';
import { PedidosTela } from './PedidosTela';
import { RelatoriosTela, type SaidaRelatorio } from './RelatoriosTela';

type NomeIcone = keyof typeof Ionicons.glyphMap;

/** Os três pilares do app, mais a conta da pessoa. */
type Pilar = 'estoque' | 'pagamentos' | 'financeiro' | 'conta';
const PILARES: Record<Pilar, { titulo: string; icone: NomeIcone }> = {
  estoque: { titulo: 'Estoque', icone: 'cube-outline' },
  pagamentos: { titulo: 'Pagamentos', icone: 'receipt-outline' },
  financeiro: { titulo: 'Financeiro', icone: 'wallet-outline' },
  conta: { titulo: 'Conta', icone: 'person-circle-outline' },
};

interface Props {
  usuario: Usuario;
  /** Presente para quem vê o estoque. */
  estoque?: Estoque;
  /** Presente para quem usa pagamentos (e, para o almoxarife, as compras a faturar). */
  financeiro?: Financeiro;
  carregarSaldos: () => Promise<SaldoSimples[]>;
  servicoFotos: ServicoFotos;
  saida: SaidaRelatorio;
  hoje: string;
  agora: () => string;
  versao?: number;
  estadoSync?: EstadoSync;
  onSincronizar?: () => void;
  onSair?: () => void;
  /** Abre o seletor de arquivos e devolve a planilha (importação do levantamento). */
  escolherPlanilha?: () => Promise<Uint8Array | undefined>;
}

/** Pilares que esta pessoa vê, na ordem do rodapé. */
export function pilaresDe(u: Usuario, tem: { estoque: boolean; financeiro: boolean }): Pilar[] {
  const lista: Pilar[] = [];
  if ((veEstoque(u) && tem.estoque) || soSaldos(u)) lista.push('estoque');
  if (temFinanceiro(u) && tem.financeiro) lista.push('pagamentos');
  if (veFinanceiro(u) && tem.financeiro) lista.push('financeiro');
  lista.push('conta');
  return lista;
}

export function Raiz(p: Props) {
  const { usuario, estoque, financeiro, hoje, versao = 0, estadoSync } = p;
  const pilares = pilaresDe(usuario, { estoque: !!estoque, financeiro: !!financeiro });
  const [pilar, setPilar] = useState<Pilar>(pilares[0]);
  const [local, setLocal] = useState(0);
  const v = versao + local;
  const alterou = useCallback(() => setLocal((n) => n + 1), []);
  const [titulo, setTitulo] = useState<{ texto: string; voltar?: () => void }>();
  const [avisos, setAvisos] = useState({ estoque: 0, pagamentos: 0 });

  // Sem acesso a nenhum pilar: login novo, aguardando o administrador definir o papel.
  const semAcesso = pilares.length === 1;
  const atual = pilares.includes(pilar) ? pilar : pilares[0];

  useEffect(() => {
    if (!financeiro || !temFinanceiro(usuario)) return;
    void financeiro.pedidos.lista().then((ps) => {
      const n = ps.filter((x) => (podeConferir(usuario) && x.status === 'enviado' && x.criado.id !== usuario.id)
        || (x.status === 'aprovacao' && podeAprovar(usuario, x.aprovador) && x.criado.id !== usuario.id)
        || (podePagar(usuario) && x.status === 'pronto')
        || (x.status === 'devolvido' && x.criado.id === usuario.id)).length;
      setAvisos((a) => ({ ...a, pagamentos: n }));
    }).catch(() => undefined);
  }, [financeiro, usuario, v]);

  const nomePilar = atual === 'estoque' && soSaldos(usuario) ? 'Saldos do galpão' : atual === 'estoque' && titulo ? titulo.texto : PILARES[atual].titulo;
  return (
    <View style={estilos.tela}>
      <Cabecalho titulo={atual === 'pagamentos' ? 'Pagamentos' : nomePilar} subtitulo={`${usuario.nome} · ${textoSync(estadoSync)}`}
        rotuloVoltar="Mais" onVoltar={atual === 'estoque' ? titulo?.voltar : undefined} />
      <View style={{ flex: 1 }}>
        {atual === 'estoque' && soSaldos(usuario) && <ConsultaTela carregar={p.carregarSaldos} hoje={hoje} versao={v} />}
        {atual === 'estoque' && !soSaldos(usuario) && estoque && (
          <PilarEstoque {...p} estoque={estoque} versao={v} onAlterou={alterou} onTitulo={setTitulo} onAvisos={(n) => setAvisos((a) => (a.estoque === n ? a : { ...a, estoque: n }))} />
        )}
        {atual === 'pagamentos' && financeiro && <PilarPagamentos financeiro={financeiro} servicoFotos={p.servicoFotos} hoje={hoje} versao={v} onAlterou={alterou} />}
        {atual === 'financeiro' && financeiro && <FinanceiroTela financeiro={financeiro} versao={v} onAlterou={alterou} escolherPlanilha={p.escolherPlanilha} />}
        {atual === 'conta' && <ContaTela {...p} semAcesso={semAcesso} />}
      </View>
      {!semAcesso && (
        <View style={{ flexDirection: 'row', backgroundColor: cores.card, borderTopWidth: 1, borderTopColor: cores.borda, paddingBottom: 6, paddingTop: 6 }}>
          {pilares.map((id) => {
            const ativo = atual === id;
            const aviso = id === 'estoque' ? avisos.estoque : id === 'pagamentos' ? avisos.pagamentos : 0;
            return (
              <Pressable key={id} testID={`pilar-${id}`} onPress={() => setPilar(id)} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                <Ionicons name={ativo ? (PILARES[id].icone.replace('-outline', '') as NomeIcone) : PILARES[id].icone} size={23} color={ativo ? cores.primaria : cores.suave} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: ativo ? cores.primaria : cores.suave }}>{PILARES[id].titulo}</Text>
                {aviso > 0 && (
                  <View testID={`aviso-pilar-${id}`} style={{ position: 'absolute', top: 0, right: '26%', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: cores.erro, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{aviso}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------
// Pilar Estoque/Controle: materiais, EPI, ferramentas e locações

type Secao = 'estoque' | 'lancar' | 'equipamentos' | 'epi' | 'mais';
type Mais = 'menu' | 'historico' | 'relatorios' | 'cadastros' | 'inventario' | 'importar' | 'importar-epi';
const TITULOS_MAIS: Record<Exclude<Mais, 'menu'>, string> = {
  historico: 'Histórico', relatorios: 'Relatórios', cadastros: 'Cadastros', inventario: 'Inventário', importar: 'Importar planilha', 'importar-epi': 'Importar EPI',
};

function PilarEstoque({ usuario, estoque, servicoFotos, saida, hoje, agora, versao = 0, onAlterou, escolherPlanilha, onTitulo, onAvisos }: Props & {
  estoque: Estoque; onAlterou: () => void; onTitulo: (t: { texto: string; voltar?: () => void }) => void; onAvisos: (n: number) => void;
}) {
  const materiais = podeLancar(usuario);
  const controle = operaControle(usuario);
  const leitura = !controle;
  const secoes: { id: Secao; titulo: string; icone: NomeIcone }[] = [
    { id: 'estoque', titulo: 'Saldos', icone: 'cube-outline' },
    ...(materiais ? [{ id: 'lancar' as const, titulo: 'Lançar', icone: 'add-circle-outline' as NomeIcone }] : []),
    { id: 'equipamentos', titulo: 'Ferramentas', icone: 'hammer-outline' },
    { id: 'epi', titulo: 'EPI', icone: 'shield-checkmark-outline' },
    { id: 'mais', titulo: 'Mais', icone: 'ellipsis-horizontal' },
  ];
  const [secao, setSecao] = useState<Secao>('estoque');
  const [tipo, setTipo] = useState<Lancamento['tipo']>('saida');
  const [mais, setMais] = useState<Mais>('menu');
  const [avisos, setAvisos] = useState({ equipamentos: 0, epi: 0 });
  const [itens, setItens] = useState<Item[]>([]);

  // Quem já recebia EPI e nunca retirou material passa para o grupo de EPI (uma vez; seguro repetir).
  useEffect(() => { if (controle) void estoque.migrarFuncionariosEpi().then((n) => { if (n) onAlterou(); }).catch(() => undefined); }, [estoque, controle, onAlterou]);

  useEffect(() => {
    void Promise.all([estoque.bens(), estoque.movimentosBens(), estoque.movimentos(), estoque.itens(true)]).then(([bens, movs, movimentos, its]) => {
      const comAlerta = bens.filter((b) => {
        const pos = posicoesDoBem(movs, b.id);
        const prazo = b.controle === 'unidade' ? emPrazo(movs, b.id, hoje) : undefined;
        const loc = situacaoLocacao(b, totalDoBem(movs, b.id), hoje);
        return (prazo && prazo.atraso > 0) || loc?.situacao === 'vencida' || loc?.situacao === 'vence' || divergenciasDeCobranca(b, pos).length > 0;
      });
      const a = { equipamentos: comAlerta.length, epi: epiParaTrocar(movimentos, hoje).length };
      setAvisos(a);
      setItens(its);
      onAvisos(a.equipamentos + a.epi);
    }).catch(() => undefined);
  }, [estoque, hoje, versao, onAvisos]);

  useEffect(() => {
    const t = secao === 'mais' && mais !== 'menu' ? TITULOS_MAIS[mais] : secoes.find((s) => s.id === secao)?.titulo ?? 'Estoque';
    onTitulo({ texto: secao === 'estoque' ? 'Estoque' : t, voltar: secao === 'mais' && mais !== 'menu' ? () => setMais('menu') : undefined });
  }, [secao, mais]); // eslint-disable-line react-hooks/exhaustive-deps

  /** O controle edita e cancela só lançamentos de EPI; o consultor, nenhum. */
  const podeAlterar = (m: Movimento) => materiais || (controle && !!itens.find((i) => i.id === m.itemId && ehEpi(i)));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', backgroundColor: cores.card, borderBottomWidth: 1, borderBottomColor: cores.borda }}>
        {secoes.map((s) => {
          const ativo = secao === s.id;
          const aviso = s.id === 'equipamentos' || s.id === 'epi' ? avisos[s.id] : 0;
          return (
            <Pressable key={s.id} testID={`aba-${s.id}`} onPress={() => { setSecao(s.id); if (s.id === 'mais') setMais('menu'); }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderBottomWidth: 2, borderBottomColor: ativo ? cores.primaria : 'transparent' }}>
              <Ionicons name={ativo ? (s.icone.replace('-outline', '') as NomeIcone) : s.icone} size={19} color={ativo ? cores.primaria : cores.suave} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: ativo ? cores.primaria : cores.suave }}>{s.titulo}</Text>
              {aviso > 0 && (
                <View testID={`aviso-${s.id}`} style={{ position: 'absolute', top: 2, right: '18%', minWidth: 16, height: 16, borderRadius: 8, backgroundColor: cores.erro, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{aviso}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flex: 1 }}>
        {secao === 'estoque' && <EstoqueTela estoque={estoque} hoje={hoje} versao={versao} />}
        {secao === 'lancar' && materiais && (
          <View style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <Chips prefixo="tipo" valor={tipo} onMudar={setTipo} opcoes={[
                { id: 'saida', titulo: 'Saída' }, { id: 'entrada', titulo: 'Entrada' },
                { id: 'devolucao', titulo: 'Devolução' }, { id: 'transferencia', titulo: 'Transferência' },
              ]} />
            </View>
            <LancamentoTela key={tipo} estoque={estoque} tipo={tipo} hoje={hoje} servicoFotos={servicoFotos} versao={versao} onSalvo={onAlterou} />
          </View>
        )}
        {secao === 'equipamentos' && <EquipamentosTela estoque={estoque} hoje={hoje} versao={versao} onAlterou={onAlterou} leitura={leitura} />}
        {secao === 'epi' && <EpiTela estoque={estoque} hoje={hoje} servicoFotos={servicoFotos} versao={versao} onAlterou={onAlterou} leitura={leitura} />}
        {secao === 'mais' && mais === 'historico' && <HistoricoTela estoque={estoque} versao={versao} onAlterou={onAlterou} podeAlterar={podeAlterar} />}
        {secao === 'mais' && mais === 'relatorios' && <RelatoriosTela estoque={estoque} hoje={hoje} agora={agora} saida={saida} versao={versao} />}
        {secao === 'mais' && mais === 'cadastros' && controle && <CadastrosTela estoque={estoque} versao={versao} onAlterou={onAlterou} soControle={!materiais} />}
        {secao === 'mais' && mais === 'importar' && materiais && <ImportarTela estoque={estoque} hoje={hoje} escolherArquivo={escolherPlanilha ?? (async () => undefined)} onAlterou={onAlterou} />}
        {secao === 'mais' && mais === 'importar-epi' && controle && <ImportarEpiTela estoque={estoque} hoje={hoje} escolherArquivo={escolherPlanilha ?? (async () => undefined)} onAlterou={onAlterou} />}
        {secao === 'mais' && mais === 'inventario' && materiais && <InventarioTela estoque={estoque} hoje={hoje} versao={versao} onConcluido={onAlterou} />}
        {secao === 'mais' && mais === 'menu' && (
          <ScrollView contentContainerStyle={estilos.conteudo}>
            {leitura && <Text testID="aviso-leitura" style={estilos.subtitulo}>Consulte saldos, EPI, ferramentas, locações, histórico e relatórios.</Text>}
            {!materiais && controle && <Text testID="aviso-controle" style={estilos.subtitulo}>Você cuida de EPI, ferramentas e locações.</Text>}
            <ItemMenu testID="abrir-historico" icone="list-outline" titulo="Histórico" sub={materiais ? 'Lançamentos de material, correções e cancelamentos' : controle ? 'Lançamentos (você corrige os de EPI)' : 'Lançamentos de material e de EPI'} onPress={() => setMais('historico')} />
            <ItemMenu testID="abrir-relatorios" icone="document-text-outline" titulo="Relatórios" sub="Saldo, gastos por obra, equipamentos e EPI (PDF e Excel)" onPress={() => setMais('relatorios')} />
            {controle && <ItemMenu testID="abrir-cadastros" icone="pricetags-outline" titulo="Cadastros" sub={materiais ? 'Itens, frentes, funcionários e EPI (itens e funcionários)' : 'Itens de EPI e funcionários'} onPress={() => setMais('cadastros')} />}
            {materiais && <ItemMenu testID="abrir-inventario" icone="clipboard-outline" titulo="Inventário" sub="Contagem física do galpão" onPress={() => setMais('inventario')} />}
            {controle && <ItemMenu testID="abrir-importar-epi" icone="shield-checkmark-outline" titulo="Importar EPI" sub="Planilhas de funcionários de EPI e de itens de EPI" onPress={() => setMais('importar-epi')} />}
            {materiais && <ItemMenu testID="abrir-importar" icone="cloud-upload-outline" titulo="Importar planilha" sub="Levantamento geral: materiais, equipamentos, frentes e funcionários" onPress={() => setMais('importar')} />}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------
// Pilar Pagamentos: pedidos de pagamento e compras a faturar

function PilarPagamentos({ financeiro, servicoFotos, hoje, versao, onAlterou }: {
  financeiro: Financeiro; servicoFotos: ServicoFotos; hoje: string; versao: number; onAlterou: () => void;
}) {
  const [tela, setTela] = useState<'pedidos' | 'compras'>('pedidos');
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Chips prefixo="tela" valor={tela} onMudar={setTela} opcoes={[{ id: 'pedidos', titulo: 'Pedidos de pagamento' }, { id: 'compras', titulo: 'Compras a faturar' }]} />
      </View>
      <View style={{ flex: 1 }}>
        {tela === 'pedidos' && <PedidosTela financeiro={financeiro} servicoFotos={servicoFotos} hoje={hoje} versao={versao} onAlterou={onAlterou} />}
        {tela === 'compras' && <ComprasTela financeiro={financeiro} servicoFotos={servicoFotos} hoje={hoje} versao={versao} onAlterou={onAlterou} />}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------------------------------------
// Conta: quem é, o que pode fazer, sincronização e sair

const NOME_ESTOQUE: Record<Usuario['papel'], string> = {
  admin: 'administrador (tudo)', almoxarife: 'almoxarife (tudo)', controle: 'EPI, ferramentas e locações', consultor: 'consulta', saldos: 'saldos do galpão', nenhum: 'sem acesso',
};

function ContaTela({ usuario, estadoSync, onSincronizar, onSair, semAcesso }: Props & { semAcesso: boolean }) {
  const pagamentos = !usuario.financeiro ? 'sem acesso'
    : usuario.financeiro === 'solicitante' ? 'faz pedidos'
      : usuario.financeiro === 'pagador' ? 'faz pedidos, confere e paga'
        : `faz pedidos, confere e aprova${podePagar(usuario) ? ' e paga' : ''}`;
  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <BarraUsuario nome={usuario.nome} estado={estadoSync} onSincronizar={onSincronizar} onSair={onSair} />
      {semAcesso && (
        <Cartao>
          <Text testID="sem-acesso" style={estilos.titulo}>Seu acesso ainda não foi liberado</Text>
          <Text style={estilos.subtitulo}>Peça ao administrador para definir o que você usa no app (estoque, pagamentos ou financeiro).</Text>
        </Cartao>
      )}
      <Cartao gap={6}>
        <Text style={estilos.secao}>Seus acessos</Text>
        {usuario.papel !== 'nenhum' && <Linha rotulo="Estoque" valor={NOME_ESTOQUE[usuario.papel]} testID="acesso-estoque" />}
        {usuario.financeiro && <Linha rotulo="Pagamentos" valor={pagamentos} testID="acesso-pagamentos" />}
        {veFinanceiro(usuario) && <Linha rotulo="Financeiro" valor="cadastros e custos" testID="acesso-financeiro" />}
      </Cartao>
    </ScrollView>
  );
}

function Linha({ rotulo, valor, testID }: { rotulo: string; valor: string; testID: string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.subtitulo}>{rotulo}</Text>
      <Text testID={testID} style={[estilos.titulo, { flexShrink: 1, textAlign: 'right' }]}>{valor}</Text>
    </View>
  );
}

function ItemMenu({ testID, icone, titulo, sub, onPress, alerta }: { testID: string; icone: NomeIcone; titulo: string; sub: string; onPress: () => void; alerta?: boolean }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[estilos.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: cores.primariaClara, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icone} size={22} color={cores.primaria} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={estilos.titulo}>{titulo}</Text>
        <Text style={[estilos.subtitulo, alerta && { color: cores.aviso, fontWeight: '700' }]}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={cores.suave} />
    </Pressable>
  );
}
