import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { Usuario } from '../domain/tipos';
import { Cabecalho } from './Cabecalho';
import { estilos } from './estilos';

interface Props {
  entrar: (email: string, senha: string) => Promise<Usuario>;
  onEntrou: (u: Usuario) => void;
}

export function LoginTela({ entrar, onEntrou }: Props) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string>();
  const [carregando, setCarregando] = useState(false);

  async function enviar() {
    if (!email.trim() || !senha) { setErro('Informe e-mail e senha'); return; }
    setErro(undefined);
    setCarregando(true);
    try {
      onEntrou(await entrar(email.trim(), senha));
    } catch (e) {
      setErro((e as Error).message || 'Não foi possível entrar');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <View style={estilos.tela}>
      <Cabecalho logo titulo="Entrar" subtitulo="Estoque do galpão" />
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <View style={[estilos.card, { gap: 12 }]}>
          <TextInput testID="email" style={estilos.entrada} placeholder="E-mail" value={email} onChangeText={setEmail}
            autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" />
          <TextInput testID="senha" style={estilos.entrada} placeholder="Senha" value={senha} onChangeText={setSenha}
            secureTextEntry textContentType="password" />
          {erro && <Text style={estilos.erro}>{erro}</Text>}
          <Pressable testID="entrar" style={[estilos.botao, carregando && { opacity: 0.6 }]} disabled={carregando} onPress={enviar}>
            {carregando ? <ActivityIndicator color="#fff" /> : <Text style={estilos.botaoTexto}>Entrar</Text>}
          </Pressable>
        </View>
        <Text style={estilos.subtitulo}>O acesso é criado pelo administrador. Depois do primeiro login, o app funciona sem internet.</Text>
      </ScrollView>
    </View>
  );
}
