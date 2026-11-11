import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Estoque } from './src/dados/estoque';
import { dataLocal } from './src/domain/datas';
import { podeLancar, type Usuario } from './src/domain/tipos';
import { novoId } from './src/fotos/id';
import { servicoFotosDoApp } from './src/fotos/servico';
import { compartilharPdf, compartilharXlsx } from './src/relatorios/saida';
import { relatorioXlsx } from './src/relatorios/xlsx';
import type { Armazenamento } from './src/storage/contrato';
import { abrirArmazenamento } from './src/storage/abrir';
import { AgendadorSync, type EstadoSync } from './src/sync/agendador';
import { Sincronizador } from './src/sync/sincronizador';
import { AutenticacaoSupabase, criarClienteSupabase, RemotoSupabase } from './src/sync/supabase';
import { cores } from './src/telas/estilos';
import { LoginTela } from './src/telas/LoginTela';
import { Raiz } from './src/telas/Raiz';
import type { SaidaRelatorio } from './src/telas/RelatoriosTela';

const sb = criarClienteSupabase();
const auth = new AutenticacaoSupabase(sb);
const remoto = new RemotoSupabase(sb);
const agora = () => new Date().toISOString();
const saida: SaidaRelatorio = {
  pdf: (html, nome, paisagem) => compartilharPdf(html, nome, paisagem),
  xlsx: async (r) => compartilharXlsx(await relatorioXlsx(r), r.arquivo),
};

export default function App() {
  const [armazenamento, setArmazenamento] = useState<Armazenamento>();
  /** undefined = carregando; null = sem login */
  const [usuario, setUsuario] = useState<Usuario | null>();
  const [estado, setEstado] = useState<EstadoSync>();
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    (async () => {
      setArmazenamento(await abrirArmazenamento());
      const atual = (await auth.usuarioAtual()) ?? null;
      setUsuario(atual);
      // O papel guardado pode estar desatualizado (ex.: alterado pelo administrador).
      if (atual) {
        const novo = await auth.atualizarPerfil();
        if (novo && (novo.papel !== atual.papel || novo.nome !== atual.nome)) setUsuario(novo);
      }
    })();
  }, []);

  const motor = useMemo(() => {
    if (!armazenamento || !usuario || !podeLancar(usuario)) return undefined;
    const agendador = new AgendadorSync(new Sincronizador(armazenamento, remoto), { atrasoMs: 1500, intervaloMs: 60_000, agora });
    const estoque = new Estoque(armazenamento, usuario, { agora, novoId, aoAlterar: () => agendador.agendar() });
    return { estoque, agendador };
  }, [armazenamento, usuario]);

  useEffect(() => {
    if (!usuario) return;
    const app = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      if (motor) void motor.agendador.agora();
      else setVersao((v) => v + 1);
    });
    if (!motor) return () => app.remove();
    const pararOuvir = motor.agendador.aoAtualizar((e) => {
      setEstado(e);
      if (e.recebidos > 0) setVersao((v) => v + 1);
    });
    const pararSync = motor.agendador.iniciar();
    const pararTempoReal = remoto.aoMudar(() => motor.agendador.agendar());
    return () => { pararOuvir(); pararSync(); pararTempoReal(); app.remove(); };
  }, [motor, usuario]);

  async function sair() {
    await auth.sair();
    setUsuario(null);
    setEstado(undefined);
  }

  let conteudo;
  if (usuario === undefined || !armazenamento) conteudo = <ActivityIndicator style={{ flex: 1 }} />;
  else if (!usuario) conteudo = <LoginTela entrar={(e, s) => auth.entrar(e, s)} onEntrou={setUsuario} />;
  else {
    conteudo = (
      <Raiz usuario={usuario} estoque={motor?.estoque} carregarSaldos={() => remoto.saldos()} servicoFotos={servicoFotosDoApp}
        saida={saida} hoje={dataLocal(agora())} agora={agora} versao={versao} estadoSync={estado}
        onSincronizar={motor ? () => void motor.agendador.agora() : undefined} onSair={sair} />
    );
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: cores.fundo }}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: cores.cabecalho }} />
        {conteudo}
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
  );
}
