import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import type { Estoque } from '../dados/estoque';
import { analisarDataBR, formatarDataBR } from '../domain/datas';
import { importarEpi, lerEpi, simularEpi, type DadosEpi, type ResumoEpi } from '../importacao/epi';
import { lerXlsx } from '../importacao/lerXlsx';
import type { ErroImportacao } from '../importacao/levantamento';
import { Botao, Campo, Cartao, Mensagem } from './componentes';
import { cores, estilos } from './estilos';

const RAIZ = 'https://github.com/clintonmatheus/Estoque/raw/main/modelos';
export const URL_MODELO_FUNCIONARIOS_EPI = `${RAIZ}/Funcionarios_EPI.xlsx`;
export const URL_MODELO_ITENS_EPI = `${RAIZ}/Itens_EPI.xlsx`;

function linhasResumo(r: ResumoEpi): string[] {
  return [
    r.funcionarios && `${r.funcionarios} funcionário(s) de EPI novo(s)`,
    r.funcionariosAtualizados && `${r.funcionariosAtualizados} funcionário(s) de EPI com dados completados`,
    r.itensNovos && `${r.itensNovos} item(ns) de EPI novo(s)`,
    r.itensAtualizados && `${r.itensAtualizados} item(ns) de EPI atualizado(s)`,
    r.itensComSaldo && `${r.itensComSaldo} item(ns) com saldo inicial`,
  ].filter((x): x is string => !!x);
}

interface Props { estoque: Estoque; hoje: string; escolherArquivo: () => Promise<Uint8Array | undefined>; onAlterou?: () => void }

/** Importa as planilhas de EPI (funcionários e/ou itens): confere tudo numa simulação e só então grava. */
export function ImportarEpiTela({ estoque, hoje, escolherArquivo, onAlterou }: Props) {
  const [data, setData] = useState(formatarDataBR(hoje));
  const [dados, setDados] = useState<DadosEpi>();
  const [resumo, setResumo] = useState<ResumoEpi>();
  const [erros, setErros] = useState<ErroImportacao[]>([]);
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState<string>();
  const [trabalhando, setTrabalhando] = useState(false);

  async function escolher() {
    setErro(undefined); setOk(undefined); setDados(undefined); setResumo(undefined); setErros([]);
    try {
      const bytes = await escolherArquivo();
      if (!bytes) return;
      setTrabalhando(true);
      const d = lerEpi(await lerXlsx(bytes));
      if (!d.funcionarios.length && !d.itens.length && !d.erros.length) throw new Error('A planilha não tem as abas "Funcionários EPI" ou "Itens EPI". Use uma das planilhas modelo.');
      const sim = await simularEpi(estoque, d, analisarDataBR(data));
      setDados(d); setResumo(sim.resumo); setErros(sim.erros);
    } catch (e) { setErro((e as Error).message); } finally { setTrabalhando(false); }
  }

  async function importar() {
    if (!dados) return;
    setErro(undefined); setTrabalhando(true);
    try {
      const dataIso = analisarDataBR(data);
      const sim = await simularEpi(estoque, dados, dataIso);
      if (sim.erros.length) { setErros(sim.erros); setResumo(sim.resumo); return; }
      const r = await importarEpi(estoque, dados, dataIso);
      setOk(`Importação concluída: ${linhasResumo(r).join('; ') || 'nada novo'}.`);
      setDados(undefined); setResumo(undefined);
      onAlterou?.();
    } catch (e) { setErro((e as Error).message); } finally { setTrabalhando(false); }
  }

  const novos = resumo ? linhasResumo(resumo) : [];
  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Cartao>
        <Text style={estilos.titulo}>Planilhas de EPI</Text>
        <Text style={estilos.subtitulo}>
          Duas planilhas modelo: uma com os funcionários que recebem EPI (CPF, função e tamanhos usuais) e outra com os itens de EPI
          (CA, vida útil, tamanhos, estoque mínimo e saldo inicial). Importe uma de cada vez. Quem recebe EPI não é o mesmo grupo que retira material do galpão.
        </Text>
        <Botao testID="baixar-modelo-func-epi" titulo="Baixar modelo: funcionários de EPI" secundario onPress={() => void Linking.openURL(URL_MODELO_FUNCIONARIOS_EPI)} />
        <Botao testID="baixar-modelo-itens-epi" titulo="Baixar modelo: itens de EPI" secundario onPress={() => void Linking.openURL(URL_MODELO_ITENS_EPI)} />
      </Cartao>
      <Cartao>
        <Campo testID="importar-data-epi" rotulo="Data do saldo inicial" value={data} onChangeText={setData} keyboardType="numbers-and-punctuation" />
        <Botao testID="escolher-planilha-epi" titulo={trabalhando ? 'Conferindo…' : 'Escolher planilha (.xlsx)'} desativado={trabalhando} onPress={() => void escolher()} />
      </Cartao>
      <Mensagem erro={erro} ok={ok} />
      {resumo && (
        <>
          <Text style={estilos.secao}>O que será importado</Text>
          <Cartao gap={4}>
            {novos.length === 0 && <Text style={estilos.subtitulo}>Nada novo para importar.</Text>}
            {novos.map((t) => <Text key={t} style={estilos.titulo}>{`• ${t}`}</Text>)}
          </Cartao>
        </>
      )}
      {erros.length > 0 && (
        <>
          <Text style={[estilos.secao, { color: cores.erro }]}>{`Corrija na planilha (${erros.length})`}</Text>
          <Cartao gap={6}>
            {erros.slice(0, 100).map((e, i) => <Text key={i} testID={`erro-epi-${i}`} style={{ color: cores.erro }}>{`${e.aba}, linha ${e.linha}: ${e.mensagem}`}</Text>)}
            <Text style={estilos.subtitulo}>Nada foi gravado. Corrija, salve a planilha e escolha o arquivo de novo.</Text>
          </Cartao>
        </>
      )}
      {resumo && !erros.length && novos.length > 0 && (
        <View style={{ gap: 8 }}>
          <Botao testID="confirmar-importacao-epi" titulo={trabalhando ? 'Importando…' : 'Importar agora'} desativado={trabalhando} onPress={() => void importar()} />
        </View>
      )}
    </ScrollView>
  );
}
