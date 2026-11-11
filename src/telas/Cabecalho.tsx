import type { ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { estilos } from './estilos';

interface Props {
  titulo: string;
  subtitulo?: string;
  rotuloVoltar?: string;
  onVoltar?: () => void;
  logo?: boolean;
  children?: ReactNode;
}

export function Cabecalho({ titulo, subtitulo, rotuloVoltar, onVoltar, logo, children }: Props) {
  return (
    <View style={estilos.cabecalho}>
      {logo && <Image testID="logo" source={require('../../assets/marca/logo-claro-horizontal.png')} style={estilos.logo} />}
      {onVoltar && (
        <Pressable testID="voltar" onPress={onVoltar} hitSlop={12}>
          <Text style={estilos.voltar}>{`‹ ${rotuloVoltar ?? 'Voltar'}`}</Text>
        </Pressable>
      )}
      <Text style={estilos.cabecalhoTitulo}>{titulo}</Text>
      {subtitulo !== undefined && <Text style={estilos.cabecalhoSub}>{subtitulo}</Text>}
      {children}
    </View>
  );
}
