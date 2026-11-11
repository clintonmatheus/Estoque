import { Pressable, Text, View } from 'react-native';
import { horaLocal } from '../domain/datas';
import type { EstadoSync } from '../sync/agendador';
import { cores, estilos } from './estilos';

export function textoSync(e?: EstadoSync): string {
  if (!e) return 'Aguardando sincronização';
  if (e.sincronizando) return 'Sincronizando…';
  if (e.erro) return 'Sem conexão — dados salvos no aparelho';
  return e.ultimaEm ? `Sincronizado às ${horaLocal(e.ultimaEm)}` : 'Aguardando sincronização';
}

interface Props {
  nome: string;
  estado?: EstadoSync;
  onSincronizar?: () => void;
  onSair?: () => void;
}

export function BarraUsuario({ nome, estado, onSincronizar, onSair }: Props) {
  return (
    <View style={[estilos.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: estado?.erro ? cores.aviso : cores.ok }} />
      <View style={{ flex: 1 }}>
        <Text testID="usuario-nome" style={estilos.titulo}>{nome}</Text>
        <Text testID="estado-sync" style={estilos.subtitulo}>{textoSync(estado)}</Text>
      </View>
      {onSincronizar && (
        <Pressable testID="sincronizar" hitSlop={8} onPress={onSincronizar}>
          <Text style={{ color: cores.primaria, fontWeight: '600' }}>Atualizar</Text>
        </Pressable>
      )}
      {onSair && (
        <Pressable testID="sair" hitSlop={8} onPress={onSair}>
          <Text style={{ color: cores.suave, fontWeight: '600' }}>Sair</Text>
        </Pressable>
      )}
    </View>
  );
}
