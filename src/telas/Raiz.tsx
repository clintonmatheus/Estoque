import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { SaldoSimples } from '../auth/autenticacao';
import type { Estoque, Lancamento } from '../dados/estoque';
import { podeLancar, type Usuario } from '../domain/tipos';
import type { ServicoFotos } from '../fotos/servico';
import type { EstadoSync } from '../sync/agendador';
import { BarraUsuario, textoSync } from './BarraUsuario';
import { Cabecalho } from './Cabecalho';
import { CadastrosTela } from './CadastrosTela';
import { Botao, Chips } from './componentes';
import { ConsultaTela } from './ConsultaTela';
import { EstoqueTela } from './EstoqueTela';
import { cores, estilos } from './estilos';
import { HistoricoTela } from './HistoricoTela';
import { InventarioTela } from './InventarioTela';
import { LancamentoTela } from './LancamentoTela';
import { RelatoriosTela, type SaidaRelatorio } from './RelatoriosTela';

type Aba = 'estoque' | 'lancar' | 'historico' | 'relatorios' | 'mais';
type NomeIcone = keyof typeof Ionicons.glyphMap;
const ABAS: { id: Aba; titulo: string; icone: NomeIcone }[] = [
  { id: 'estoque', titulo: 'Estoque', icone: 'cube-outline' },
  { id: 'lancar', titulo: 'Lançar', icone: 'add-circle-outline' },
  { id: 'historico', titulo: 'Histórico', icone: 'list-outline' },
  { id: 'relatorios', titulo: 'Relatórios', icone: 'document-text-outline' },
  { id: 'mais', titulo: 'Mais', icone: 'ellipsis-horizontal' },
];

interface Props {
  usuario: Usuario;
  /** Ausente para o consultor (ele só consulta saldos online). */
  estoque?: Estoque;
  carregarSaldos: () => Promise<SaldoSimples[]>;
  servicoFotos: ServicoFotos;
  saida: SaidaRelatorio;
  hoje: string;
  agora: () => string;
  versao?: number;
  estadoSync?: EstadoSync;
  onSincronizar?: () => void;
  onSair?: () => void;
}

export function Raiz(p: Props) {
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

function RaizLancador({ usuario, estoque, servicoFotos, saida, hoje, agora, versao = 0, estadoSync, onSincronizar, onSair }: Props & { estoque: Estoque }) {
  const [aba, setAba] = useState<Aba>('estoque');
  const [tipo, setTipo] = useState<Lancamento['tipo']>('saida');
  const [mais, setMais] = useState<'menu' | 'cadastros' | 'inventario'>('menu');
  const [local, setLocal] = useState(0);
  const v = versao + local;
  const alterou = () => setLocal((n) => n + 1);

  const titulo = aba === 'mais' && mais !== 'menu' ? (mais === 'cadastros' ? 'Cadastros' : 'Inventário') : ABAS.find((a) => a.id === aba)!.titulo;
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
        {aba === 'historico' && <HistoricoTela estoque={estoque} versao={v} onAlterou={alterou} />}
        {aba === 'relatorios' && <RelatoriosTela estoque={estoque} hoje={hoje} agora={agora} saida={saida} versao={v} />}
        {aba === 'mais' && mais === 'cadastros' && <CadastrosTela estoque={estoque} versao={v} onAlterou={alterou} />}
        {aba === 'mais' && mais === 'inventario' && <InventarioTela estoque={estoque} hoje={hoje} versao={v} onConcluido={alterou} />}
        {aba === 'mais' && mais === 'menu' && (
          <ScrollView contentContainerStyle={estilos.conteudo}>
            <BarraUsuario nome={`${usuario.nome} (${usuario.papel === 'admin' ? 'administrador' : 'almoxarife'})`} estado={estadoSync} onSincronizar={onSincronizar} onSair={onSair} />
            <ItemMenu testID="abrir-cadastros" icone="pricetags-outline" titulo="Cadastros" sub="Itens, frentes de serviço e funcionários" onPress={() => setMais('cadastros')} />
            <ItemMenu testID="abrir-inventario" icone="clipboard-outline" titulo="Inventário" sub="Contagem física do galpão" onPress={() => setMais('inventario')} />
          </ScrollView>
        )}
      </View>
      <View style={{ flexDirection: 'row', backgroundColor: cores.card, borderTopWidth: 1, borderTopColor: cores.borda, paddingBottom: 6, paddingTop: 6 }}>
        {ABAS.map((a) => (
          <Pressable key={a.id} testID={`aba-${a.id}`} onPress={() => { setAba(a.id); if (a.id === 'mais') setMais('menu'); }}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Ionicons name={aba === a.id ? (a.icone.replace('-outline', '') as NomeIcone) : a.icone} size={23} color={aba === a.id ? cores.primaria : cores.suave} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: aba === a.id ? cores.primaria : cores.suave }}>{a.titulo}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ItemMenu({ testID, icone, titulo, sub, onPress }: { testID: string; icone: NomeIcone; titulo: string; sub: string; onPress: () => void }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[estilos.card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: cores.primariaClara, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icone} size={22} color={cores.primaria} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={estilos.titulo}>{titulo}</Text>
        <Text style={estilos.subtitulo}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={cores.suave} />
    </Pressable>
  );
}
