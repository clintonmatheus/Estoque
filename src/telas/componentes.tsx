import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { cores, estilos } from './estilos';

export function Botao({ titulo, onPress, testID, secundario, perigo, desativado }: {
  titulo: string; onPress: () => void; testID?: string; secundario?: boolean; perigo?: boolean; desativado?: boolean;
}) {
  const fundo = secundario ? cores.primariaClara : perigo ? cores.erro : cores.primaria;
  return (
    <Pressable testID={testID} disabled={desativado} onPress={onPress}
      style={[estilos.botao, { backgroundColor: fundo, flex: secundario || perigo ? 1 : undefined }, desativado && { opacity: 0.5 }]}>
      <Text style={[estilos.botaoTexto, secundario && { color: cores.primaria }]}>{titulo}</Text>
    </Pressable>
  );
}

export function Campo({ rotulo, ...props }: TextInputProps & { rotulo: string }) {
  return (
    <View style={{ gap: 4, flex: (props.style as { flex?: number } | undefined)?.flex }}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput placeholderTextColor={cores.suave} {...props} style={[estilos.entrada, props.style]} />
    </View>
  );
}

export function Chips<T extends string>({ opcoes, valor, onMudar, prefixo }: {
  opcoes: { id: T; titulo: string }[]; valor: T; onMudar: (v: T) => void; prefixo?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {opcoes.map((o) => (
        <Pressable key={o.id} testID={`${prefixo ?? 'chip'}-${o.id}`} onPress={() => onMudar(o.id)}
          style={[estilos.chip, valor === o.id && estilos.chipAtivo]}>
          <Text style={[estilos.chipTexto, valor === o.id && estilos.chipTextoAtivo]}>{o.titulo}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export interface Opcao { id: string; titulo: string; subtitulo?: string }

/** Campo que abre uma lista com busca (itens, frentes, funcionários). */
export function Seletor({ rotulo, valor, opcoes, onEscolher, testID, vazio = 'Selecionar…' }: {
  rotulo: string; valor?: string; opcoes: Opcao[]; onEscolher: (id: string) => void; testID: string; vazio?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const escolhida = opcoes.find((o) => o.id === valor);
  return (
    <View style={{ gap: 4 }}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Pressable testID={testID} onPress={() => setAberto(true)} style={[estilos.entrada, { justifyContent: 'center' }]}>
        <Text style={{ fontSize: 16, color: escolhida ? cores.texto : cores.suave }}>{escolhida ? escolhida.titulo : vazio}</Text>
        {escolhida?.subtitulo && <Text style={estilos.subtitulo}>{escolhida.subtitulo}</Text>}
      </Pressable>
      <ListaEscolha visivel={aberto} titulo={rotulo} opcoes={opcoes} testID={testID}
        onFechar={() => setAberto(false)} onEscolher={(id) => { setAberto(false); onEscolher(id); }} />
    </View>
  );
}

export function ListaEscolha({ visivel, titulo, opcoes, onEscolher, onFechar, testID }: {
  visivel: boolean; titulo: string; opcoes: Opcao[]; onEscolher: (id: string) => void; onFechar: () => void; testID: string;
}) {
  const [busca, setBusca] = useState('');
  const filtradas = useMemo(() => filtrar(opcoes, busca, (o) => `${o.titulo} ${o.subtitulo ?? ''}`), [opcoes, busca]);
  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar}>
      <View style={[estilos.tela, { paddingTop: 48 }]}>
        <View style={{ padding: 16, gap: 8 }}>
          <View style={estilos.linha}>
            <Text style={estilos.titulo}>{titulo}</Text>
            <Pressable testID={`${testID}-fechar`} onPress={onFechar} hitSlop={12}><Text style={{ color: cores.primaria, fontWeight: '600' }}>Fechar</Text></Pressable>
          </View>
          <TextInput testID={`${testID}-busca`} style={estilos.entrada} placeholder="Buscar…" value={busca} onChangeText={setBusca} autoFocus />
        </View>
        <FlatList data={filtradas} keyExtractor={(o) => o.id} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 8 }}
          ListEmptyComponent={<Text style={estilos.subtitulo}>Nada encontrado.</Text>}
          renderItem={({ item }) => (
            <Pressable testID={`${testID}-opcao-${item.id}`} onPress={() => onEscolher(item.id)} style={estilos.card}>
              <Text style={estilos.titulo}>{item.titulo}</Text>
              {item.subtitulo && <Text style={estilos.subtitulo}>{item.subtitulo}</Text>}
            </Pressable>
          )} />
      </View>
    </Modal>
  );
}

/** Busca sem acentos e por várias palavras ("massa 25" acha "MASSA ACRILICA IQUINE 25KG"). */
export function filtrar<T>(lista: T[], busca: string, texto: (x: T) => string): T[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const termos = norm(busca).split(/\s+/).filter(Boolean);
  if (!termos.length) return lista;
  return lista.filter((x) => { const t = norm(texto(x)); return termos.every((p) => t.includes(p)); });
}

export function Cartao({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return <View style={[estilos.card, { gap }]}>{children}</View>;
}

export function Mensagem({ erro, ok }: { erro?: string; ok?: string }) {
  if (erro) return <Text testID="erro" style={estilos.erro}>{erro}</Text>;
  if (ok) return <Text testID="ok" style={{ color: cores.ok, fontWeight: '600' }}>{ok}</Text>;
  return null;
}
