import { useCallback, useEffect, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import type { SaldoSimples } from '../auth/autenticacao';
import { formatarNumero, formatarQuantidade } from '../domain/formato';
import { Botao, Chips, filtrar } from './componentes';
import { cores, estilos } from './estilos';

interface Props {
  carregar: () => Promise<SaldoSimples[]>;
  versao?: number;
}

/** Tela do consultor: só saldos, sem valores (precisa de internet). */
export function ConsultaTela({ carregar, versao = 0 }: Props) {
  const [saldos, setSaldos] = useState<SaldoSimples[]>();
  const [erro, setErro] = useState<string>();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'minimo'>('todos');

  const atualizar = useCallback(async () => {
    setErro(undefined);
    try { setSaldos(await carregar()); } catch (e) { setErro((e as Error).message || 'Não foi possível carregar'); }
  }, [carregar]);
  useEffect(() => { void atualizar(); }, [atualizar, versao]);

  const abaixo = (s: SaldoSimples) => s.estoqueMinimo > 0 && s.saldo <= s.estoqueMinimo;
  const lista = filtrar(saldos ?? [], busca, (s) => s.nome).filter((s) => filtro === 'todos' || abaixo(s));
  return (
    <FlatList
      data={lista}
      keyExtractor={(s) => s.itemId}
      contentContainerStyle={estilos.conteudo}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          {erro && <Text testID="erro" style={estilos.erro}>{`${erro}. A consulta precisa de internet.`}</Text>}
          <TextInput testID="busca" style={estilos.entrada} placeholder="Buscar item…" value={busca} onChangeText={setBusca} />
          <Chips prefixo="filtro" valor={filtro} onMudar={setFiltro}
            opcoes={[{ id: 'todos', titulo: 'Todos' }, { id: 'minimo', titulo: `Abaixo do mínimo (${(saldos ?? []).filter(abaixo).length})` }]} />
          <Botao testID="atualizar" titulo="Atualizar saldos" secundario onPress={() => void atualizar()} />
        </View>
      }
      ListEmptyComponent={<Text style={estilos.subtitulo}>{saldos ? 'Nenhum item encontrado.' : 'Carregando…'}</Text>}
      renderItem={({ item: s }) => (
        <View testID="saldo-item" style={estilos.card}>
          <Text style={estilos.titulo}>{s.nome}</Text>
          <Text style={[estilos.subtitulo, abaixo(s) && { color: cores.aviso, fontWeight: '700' }]}>
            {formatarQuantidade(s, s.saldo)}{abaixo(s) ? ` · mínimo ${formatarNumero(s.estoqueMinimo)}` : ''}
          </Text>
        </View>
      )}
    />
  );
}
