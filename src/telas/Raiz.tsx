import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { SaldoSimples } from '../auth/autenticacao';
import type { Estoque, Lancamento } from '../dados/estoque';
import type { Financeiro } from '../dados/financeiro';
import { emPrazo, posicoesDoBem, situacaoLocacao, totalDoBem, divergenciasDeCobranca } from '../domain/bens';
import { epiParaTrocar } from '../domain/epi';
import { podeLancar, type PapelFinanceiro, type Usuario } from '../domain/tipos';
import type { ServicoFotos } from '../fotos/servico';
import type { EstadoSync } from '../sync/agendador';
import { BarraUsuario, textoSync } from './BarraUsuario';
import { Cabecalho } from './Cabecalho';
import { CadastrosTela } from './CadastrosTela';
import { Botao, Chips } from './componentes';
import { ConsultaTela } from './ConsultaTela';
import { EpiTela } from './EpiTela';
import { EstoqueTela } from './EstoqueTela';
import { EquipamentosTela } from './EquipamentosTela';
import { FinanceiroTela } from './FinanceiroTela';
import { cores, estilos } from './estilos';
import { HistoricoTela } from './HistoricoTela';
import { ImportarEpiTela } from './ImportarEpiTela';
import { ImportarTela } from './ImportarTela';
import { InventarioTela } from './InventarioTela';
import { LancamentoTela } from './LancamentoTela';
import { PedidosTela } from './PedidosTela';
import { RelatoriosTela, type SaidaRelatorio } from './RelatoriosTela';

type Aba = 'estoque' | 'lancar' | 'equipamentos' | 'epi' | 'mais';
type NomeIcone = keyof typeof Ionicons.glyphMap;
const ABAS: { id: Aba; titulo: string; icone: NomeIcone }[] = [
  { id: 'estoque', titulo: 'Estoque', icone: 'cube-outline' },
  { id: 'lancar', titulo: 'Lançar', icone: 'add-circle-outline' },
  { id: 'equipamentos', titulo: 'Equipamentos', icone: 'hammer-outline' },
  { id: 'epi', titulo: 'EPI', icone: 'shield-checkmark-outline' },
  { id: 'mais', titulo: 'Mais', icone: 'ellipsis-horizontal' },
];

interface Props {
  usuario: Usuario;
  /** Ausente para o consultor (ele só consulta saldos online). */
  estoque?: Estoque;
  /** Presente para quem tem perfil no financeiro. */
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

const NOME_FIN: Record<PapelFinanceiro, string> = { admin: 'administrador', pagador: 'pagador', solicitante: 'solicitante' };

export function Raiz(p: Props) {
  if (p.financeiro && p.usuario.financeiro && !podeLancar(p.usuario)) return <RaizFinanceiro {...p} financeiro={p.financeiro} />;
  if (!p.estoque || !podeLancar(p.usuario)) {
    return (
      <View style={estilos.tela}>
        <Cabecalho titulo="Estoque" subtitulo={`${p.usuario.nome} · consulta de saldos`}
          direita={<Pressable testID="sair" onPress={p.onSair} hitSlop={8}><Text style={estilos.voltar}>Sair</Text></Pressable>} />
        <ConsultaTela carregar={p.carregarSaldos} hoje={p.hoje} versao={p.versao} />
      </View>
    );
  }
  return <RaizLancador {...p} estoque={p.estoque} />;
}

/** Quem usa só o financeiro (não lança no galpão): cadastros do financeiro e consulta de saldos. */
function RaizFinanceiro({ usuario, financeiro, servicoFotos, carregarSaldos, hoje, versao = 0, estadoSync, onSincronizar, onSair, escolherPlanilha }: Props & { financeiro: Financeiro }) {
  const [tela, setTela] = useState<'pedidos' | 'financeiro' | 'saldos'>('pedidos');
  const [local, setLocal] = useState(0);
  return (
    <View style={estilos.tela}>
      <Cabecalho titulo={tela === 'pedidos' ? 'Pedidos de pagamento' : tela === 'financeiro' ? 'Cadastros do financeiro' : 'Saldos do galpão'} subtitulo={`${usuario.nome} · ${NOME_FIN[usuario.financeiro!]} · ${textoSync(estadoSync)}`}
        direita={<Pressable testID="sair" onPress={onSair} hitSlop={8}><Text style={estilos.voltar}>Sair</Text></Pressable>} />
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Chips prefixo="tela" valor={tela} onMudar={setTela} opcoes={[{ id: 'pedidos', titulo: 'Pedidos' }, { id: 'financeiro', titulo: 'Cadastros' }, { id: 'saldos', titulo: 'Saldos do galpão' }]} />
      </View>
      <View style={{ flex: 1 }}>
        {tela === 'pedidos' && <PedidosTela financeiro={financeiro} servicoFotos={servicoFotos} hoje={hoje} versao={versao + local} onAlterou={() => setLocal((n) => n + 1)} />}
        {tela === 'financeiro' && <FinanceiroTela financeiro={financeiro} versao={versao + local} onAlterou={() => setLocal((n) => n + 1)} escolherPlanilha={escolherPlanilha} />}
        {tela === 'saldos' && <ConsultaTela carregar={carregarSaldos} hoje={hoje} versao={versao} />}
      </View>
      {onSincronizar && (
        <Pressable testID="sincronizar" onPress={onSincronizar} style={{ padding: 10, alignItems: 'center', backgroundColor: cores.card, borderTopWidth: 1, borderTopColor: cores.borda }}>
          <Text style={{ color: cores.primaria, fontWeight: '700' }}>Sincronizar agora</Text>
        </Pressable>
      )}
    </View>
  );
}

function RaizLancador({ usuario, estoque, financeiro, servicoFotos, saida, hoje, agora, versao = 0, estadoSync, onSincronizar, onSair, escolherPlanilha }: Props & { estoque: Estoque }) {
  const [aba, setAba] = useState<Aba>('estoque');
  const [tipo, setTipo] = useState<Lancamento['tipo']>('saida');
  const [mais, setMais] = useState<'menu' | 'historico' | 'relatorios' | 'cadastros' | 'inventario' | 'importar' | 'importar-epi' | 'financeiro' | 'pedidos'>('menu');
  const [avisos, setAvisos] = useState({ equipamentos: 0, epi: 0 });
  const [local, setLocal] = useState(0);
  const v = versao + local;
  const alterou = () => setLocal((n) => n + 1);

  // Quem já recebia EPI e nunca retirou material passa para o grupo de EPI (uma vez; seguro repetir).
  useEffect(() => { void estoque.migrarFuncionariosEpi().then((n) => { if (n) setLocal((x) => x + 1); }).catch(() => undefined); }, [estoque]);

  useEffect(() => {
    void Promise.all([estoque.bens(), estoque.movimentosBens(), estoque.movimentos()]).then(([bens, movs, movimentos]) => {
      const comAlerta = bens.filter((b) => {
        const pos = posicoesDoBem(movs, b.id);
        const prazo = b.controle === 'unidade' ? emPrazo(movs, b.id, hoje) : undefined;
        const loc = situacaoLocacao(b, totalDoBem(movs, b.id), hoje);
        return (prazo && prazo.atraso > 0) || loc?.situacao === 'vencida' || loc?.situacao === 'vence' || divergenciasDeCobranca(b, pos).length > 0;
      });
      setAvisos({ equipamentos: comAlerta.length, epi: epiParaTrocar(movimentos, hoje).length });
    });
  }, [estoque, hoje, v]);

  const TITULOS = { historico: 'Histórico', relatorios: 'Relatórios', cadastros: 'Cadastros', inventario: 'Inventário', importar: 'Importar planilha', 'importar-epi': 'Importar EPI', financeiro: 'Financeiro', pedidos: 'Pedidos de pagamento' } as const;
  const titulo = aba === 'mais' && mais !== 'menu' ? TITULOS[mais] : ABAS.find((a) => a.id === aba)!.titulo;
  return (
    <View style={estilos.tela}>
      <Cabecalho titulo={titulo} subtitulo={`${usuario.nome} · ${textoSync(estadoSync)}`}
        rotuloVoltar="Mais" onVoltar={aba === 'mais' && mais !== 'menu' ? () => setMais('menu') : undefined} />
      <View style={{ flex: 1 }}>
        {aba === 'estoque' && <EstoqueTela estoque={estoque} hoje={hoje} versao={v} />}
        {aba === 'lancar' && (
          <View style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <Chips prefixo="tipo" valor={tipo} onMudar={setTipo} opcoes={[
                { id: 'saida', titulo: 'Saída' }, { id: 'entrada', titulo: 'Entrada' },
                { id: 'devolucao', titulo: 'Devolução' }, { id: 'transferencia', titulo: 'Transferência' },
              ]} />
            </View>
            <LancamentoTela key={tipo} estoque={estoque} tipo={tipo} hoje={hoje} servicoFotos={servicoFotos} versao={v} onSalvo={alterou} />
          </View>
        )}
        {aba === 'equipamentos' && <EquipamentosTela estoque={estoque} hoje={hoje} versao={v} onAlterou={alterou} />}
        {aba === 'epi' && <EpiTela estoque={estoque} hoje={hoje} servicoFotos={servicoFotos} versao={v} onAlterou={alterou} />}
        {aba === 'mais' && mais === 'historico' && <HistoricoTela estoque={estoque} versao={v} onAlterou={alterou} />}
        {aba === 'mais' && mais === 'relatorios' && <RelatoriosTela estoque={estoque} hoje={hoje} agora={agora} saida={saida} versao={v} />}
        {aba === 'mais' && mais === 'cadastros' && <CadastrosTela estoque={estoque} versao={v} onAlterou={alterou} />}
        {aba === 'mais' && mais === 'importar' && <ImportarTela estoque={estoque} hoje={hoje} escolherArquivo={escolherPlanilha ?? (async () => undefined)} onAlterou={alterou} />}
        {aba === 'mais' && mais === 'importar-epi' && <ImportarEpiTela estoque={estoque} hoje={hoje} escolherArquivo={escolherPlanilha ?? (async () => undefined)} onAlterou={alterou} />}
        {aba === 'mais' && mais === 'pedidos' && financeiro && <PedidosTela financeiro={financeiro} servicoFotos={servicoFotos} hoje={hoje} versao={v} onAlterou={alterou} />}
        {aba === 'mais' && mais === 'financeiro' && financeiro && <FinanceiroTela financeiro={financeiro} versao={v} onAlterou={alterou} escolherPlanilha={escolherPlanilha} />}
        {aba === 'mais' && mais === 'inventario' && <InventarioTela estoque={estoque} hoje={hoje} versao={v} onConcluido={alterou} />}
        {aba === 'mais' && mais === 'menu' && (
          <ScrollView contentContainerStyle={estilos.conteudo}>
            <BarraUsuario nome={`${usuario.nome} (${usuario.papel === 'admin' ? 'administrador' : 'almoxarife'})`} estado={estadoSync} onSincronizar={onSincronizar} onSair={onSair} />
            <ItemMenu testID="abrir-historico" icone="list-outline" titulo="Histórico" sub="Lançamentos de material, correções e cancelamentos" onPress={() => setMais('historico')} />
            <ItemMenu testID="abrir-relatorios" icone="document-text-outline" titulo="Relatórios" sub="Saldo, gastos por obra, equipamentos e EPI (PDF e Excel)" onPress={() => setMais('relatorios')} />
            <ItemMenu testID="abrir-cadastros" icone="pricetags-outline" titulo="Cadastros" sub="Itens, frentes, funcionários e EPI (itens e funcionários)" onPress={() => setMais('cadastros')} />
            <ItemMenu testID="abrir-inventario" icone="clipboard-outline" titulo="Inventário" sub="Contagem física do galpão" onPress={() => setMais('inventario')} />
            <ItemMenu testID="abrir-importar-epi" icone="shield-checkmark-outline" titulo="Importar EPI" sub="Planilhas de funcionários de EPI e de itens de EPI" onPress={() => setMais('importar-epi')} />
            <ItemMenu testID="abrir-importar" icone="cloud-upload-outline" titulo="Importar planilha" sub="Levantamento geral: materiais, equipamentos, frentes e funcionários" onPress={() => setMais('importar')} />
            {financeiro && usuario.financeiro && (
              <ItemMenu testID="abrir-pedidos" icone="receipt-outline" titulo="Pedidos de pagamento" sub="Solicitar, conferir, aprovar e pagar" onPress={() => setMais('pedidos')} />
            )}
            {financeiro && usuario.financeiro && (
              <ItemMenu testID="abrir-financeiro" icone="wallet-outline" titulo="Financeiro" sub="Empresas, contas, centros de custo, fornecedores e tipos de despesa" onPress={() => setMais('financeiro')} />
            )}
          </ScrollView>
        )}
      </View>
      <View style={{ flexDirection: 'row', backgroundColor: cores.card, borderTopWidth: 1, borderTopColor: cores.borda, paddingBottom: 6, paddingTop: 6 }}>
        {ABAS.map((a) => (
          <Pressable key={a.id} testID={`aba-${a.id}`} onPress={() => { setAba(a.id); if (a.id === 'mais') setMais('menu'); }}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Ionicons name={aba === a.id ? (a.icone.replace('-outline', '') as NomeIcone) : a.icone} size={23} color={aba === a.id ? cores.primaria : cores.suave} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: aba === a.id ? cores.primaria : cores.suave }}>{a.titulo}</Text>
            {(a.id === 'equipamentos' || a.id === 'epi') && avisos[a.id] > 0 && (
              <View testID={`aviso-${a.id}`} style={{ position: 'absolute', top: 0, right: '22%', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: cores.erro, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{avisos[a.id]}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
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
