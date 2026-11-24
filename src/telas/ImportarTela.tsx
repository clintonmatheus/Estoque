import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { analisarDataBR, formatarDataBR } from '../domain/datas';
import { importarLevantamento, simularImportacao, type ResumoImportacao } from '../importacao/aplicar';
import { lerXlsx } from '../importacao/lerXlsx';
import { lerLevantamento, type ErroImportacao, type Levantamento } from '../importacao/levantamento';
import { Botao, Campo, Cartao, Mensagem } from './componentes';
import { cores, estilos } from './estilos';

export const URL_MODELO = 'https://github.com/clintonmatheus/Estoque/raw/main/modelos/Levantamento_Estoque.xlsx';

interface Props { estoque: Estoque; hoje: string; escolherArquivo: () => Promise<Uint8Array | undefined>; onAlterou?: () => void }

function linhasResumo(r: ResumoImportacao): string[] {
  return [
    r.frentes && `${r.frentes} frente(s) de serviço nova(s)`,
    r.funcionarios && `${r.funcionarios} funcionário(s) novo(s)`,
    r.itensNovos && `${r.itensNovos} item(ns) de material novo(s)`,
    r.itensAtualizados && `${r.itensAtualizados} item(ns) com estoque mínimo/categoria atualizado`,
    r.itensComSaldo && `${r.itensComSaldo} item(ns) com saldo inicial no galpão`,
    r.equipamentos && `${r.equipamentos} ferramenta(s)/equipamento(s) cadastrados (${r.movimentacoes} posse(s))`,
  ].filter((x): x is string => !!x);
}

/** Importa a planilha de levantamento: confere tudo numa simulação, mostra os erros por linha e só então grava. */
export function ImportarTela({ estoque, hoje, escolherArquivo, onAlterou }: Props) {
  const [data, setData] = useState(formatarDataBR(hoje));
  const [lev, setLev] = useState<Levantamento>();
  const [resumo, setResumo] = useState<ResumoImportacao>();
  const [erros, setErros] = useState<ErroImportacao[]>([]);
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState<string>();
  const [trabalhando, setTrabalhando] = useState(false);

  async function escolher() {
    setErro(undefined); setOk(undefined); setLev(undefined); setResumo(undefined); setErros([]);
    try {
      const bytes = await escolherArquivo();
      if (!bytes) return;
      setTrabalhando(true);
      const l = lerLevantamento(await lerXlsx(bytes));
      const sim = await simularImportacao(estoque, l, analisarDataBR(data));
      setLev(l); setResumo(sim.resumo); setErros(sim.erros);
    } catch (e) { setErro((e as Error).message); } finally { setTrabalhando(false); }
  }

  async function importar() {
    if (!lev) return;
    setErro(undefined); setTrabalhando(true);
    try {
      const dataIso = analisarDataBR(data);
      const sim = await simularImportacao(estoque, lev, dataIso); // confere de novo: alguém pode ter lançado algo no meio tempo
      if (sim.erros.length) { setErros(sim.erros); setResumo(sim.resumo); return; }
      const r = await importarLevantamento(estoque, lev, dataIso);
      setOk(`Importação concluída: ${linhasResumo(r).join('; ') || 'nada novo'}.`);
      setLev(undefined); setResumo(undefined);
      onAlterou?.();
    } catch (e) { setErro((e as Error).message); } finally { setTrabalhando(false); }
  }

  const vazio = resumo && linhasResumo(resumo).length === 0;
  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Cartao>
        <Text style={estilos.titulo}>Planilha de levantamento</Text>
        <Text style={estilos.subtitulo}>
          Preencha a planilha modelo (frentes de serviço, funcionários, materiais com saldo e ferramentas/equipamentos) e escolha o arquivo aqui.
          O app confere tudo antes de gravar.
        </Text>
        <Botao testID="baixar-modelo" titulo="Baixar planilha modelo" secundario onPress={() => void Linking.openURL(URL_MODELO)} />
      </Cartao>
      <Cartao>
        <Campo testID="importar-data" rotulo="Data do levantamento" value={data} onChangeText={setData} keyboardType="numbers-and-punctuation" />
        <Botao testID="escolher-planilha" titulo={trabalhando ? 'Conferindo…' : 'Escolher planilha (.xlsx)'} desativado={trabalhando} onPress={() => void escolher()} />
      </Cartao>
      <Mensagem erro={erro} ok={ok} />

      {resumo && (
        <>
          <Text style={estilos.secao}>O que será importado</Text>
          <Cartao gap={4}>
            {vazio && <Text style={estilos.subtitulo}>Nada novo para importar.</Text>}
            {linhasResumo(resumo).map((t) => <Text key={t} style={estilos.titulo}>{`• ${t}`}</Text>)}
          </Cartao>
        </>
      )}
      {erros.length > 0 && (
        <>
          <Text style={[estilos.secao, { color: cores.erro }]}>{`Corrija na planilha (${erros.length})`}</Text>
          <Cartao gap={6}>
            {erros.slice(0, 100).map((e, i) => (
              <Text key={i} testID={`erro-imp-${i}`} style={{ color: cores.erro }}>{`${e.aba}, linha ${e.linha}: ${e.mensagem}`}</Text>
            ))}
            <Text style={estilos.subtitulo}>Nada foi gravado. Corrija, salve a planilha e escolha o arquivo de novo.</Text>
          </Cartao>
        </>
      )}
      {resumo && !erros.length && !vazio && (
        <View style={{ gap: 8 }}>
          <Botao testID="confirmar-importacao" titulo={trabalhando ? 'Importando…' : 'Importar agora'} desativado={trabalhando} onPress={() => void importar()} />
        </View>
      )}
    </ScrollView>
  );
}
