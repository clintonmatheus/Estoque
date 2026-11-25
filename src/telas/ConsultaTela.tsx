import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import type { SaldoSimples } from '../auth/autenticacao';
import { categoriaDoItem } from '../domain/categorias';
import { CATEGORIA_EPI } from '../domain/tipos';
import type { LinhaSaldo } from '../domain/filtros';
import { Botao } from './componentes';
import { estilos } from './estilos';
import { ListaSaldos } from './ListaSaldos';

interface Props {
  carregar: () => Promise<SaldoSimples[]>;
  hoje: string;
  versao?: number;
}

/** Tela do consultor: só saldos, sem valores (precisa de internet). */
export function ConsultaTela({ carregar, hoje, versao = 0 }: Props) {
  const [linhas, setLinhas] = useState<LinhaSaldo[]>();
  const [erro, setErro] = useState<string>();

  const atualizar = useCallback(async () => {
    setErro(undefined);
    try {
      setLinhas((await carregar()).filter((s) => s.categoria !== CATEGORIA_EPI).map((s) => ({ ...s, categoria: categoriaDoItem(s) })));
    } catch (e) {
      setErro((e as Error).message || 'Não foi possível carregar');
    }
  }, [carregar]);
  useEffect(() => { void atualizar(); }, [atualizar, versao]);

  return (
    <ListaSaldos linhas={linhas ?? []} hoje={hoje} completo={false} vazio={linhas ? 'Nenhum item cadastrado.' : 'Carregando…'}
      topo={
        <>
          {erro && <Text testID="erro" style={estilos.erro}>{`${erro}. A consulta precisa de internet.`}</Text>}
          <Botao testID="atualizar" titulo="Atualizar saldos" secundario onPress={() => void atualizar()} />
        </>
      } />
  );
}
