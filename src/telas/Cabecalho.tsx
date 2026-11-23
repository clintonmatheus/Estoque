import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cores, estilos } from './estilos';

interface Props {
  titulo: string;
  subtitulo?: string;
  rotuloVoltar?: string;
  onVoltar?: () => void;
  /** Ação à direita do título (ex.: Sair). */
  direita?: ReactNode;
  children?: ReactNode;
}

export function Cabecalho({ titulo, subtitulo, rotuloVoltar, onVoltar, direita, children }: Props) {
  return (
    <View style={estilos.cabecalho}>
      {onVoltar && (
        <Pressable testID="voltar" onPress={onVoltar} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' }}>
          <Ionicons name="chevron-back" size={18} color={cores.cabecalhoSuave} />
          <Text style={estilos.voltar}>{rotuloVoltar ?? 'Voltar'}</Text>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={[estilos.cabecalhoTitulo, { flex: 1 }]}>{titulo}</Text>
        {direita}
      </View>
      {subtitulo !== undefined && <Text style={estilos.cabecalhoSub}>{subtitulo}</Text>}
      {children}
    </View>
  );
}
