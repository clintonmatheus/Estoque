import { useState } from 'react';
import { Linking, ScrollView, Text } from 'react-native';
import type { Financeiro } from '../dados/financeiro';
import { importarCadastrosFinanceiro, lerCadastrosFinanceiro, simularCadastrosFinanceiro, type CadastrosFinanceiro, type ResumoCadastros } from '../importacao/cadastrosFinanceiro';
import { lerXlsx } from '../importacao/lerXlsx';
import type { ErroImportacao } from '../importacao/levantamento';
import { Botao, Cartao, Mensagem } from './componentes';
import { cores, estilos } from './estilos';

export const URL_MODELO_FINANCEIRO = 'https://github.com/clintonmatheus/Estoque/raw/main/modelos/Cadastros_Financeiro.xlsx';

function linhasResumo(r: ResumoCadastros): string[] {
  return [
    r.empresas && `${r.empresas} empresa(s)`,
    r.contas && `${r.contas} conta(s) bancária(s)`,
    r.centros && `${r.centros} centro(s) de custo`,
    r.frentes && `${r.frentes} frente(s) de serviço nova(s)`,
    r.frentesLigadas && `${r.frentesLigadas} frente(s) do estoque ligada(s) a um centro de custo`,
    r.fornecedores && `${r.fornecedores} fornecedor(es)`,
    r.tipos && `${r.tipos} tipo(s) de despesa`,
  ].filter((x): x is string => !!x);
}

interface Props { financeiro: Financeiro; escolherArquivo: () => Promise<Uint8Array | undefined>; onAlterou?: () => void }

/** Importa a planilha de cadastros: confere tudo numa simulação, mostra os erros por linha e só então grava. */
export function ImportarFinanceiroTela({ financeiro, escolherArquivo, onAlterou }: Props) {
  const [cad, setCad] = useState<CadastrosFinanceiro>();
  const [resumo, setResumo] = useState<ResumoCadastros>();
  const [erros, setErros] = useState<ErroImportacao[]>([]);
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState<string>();
  const [trabalhando, setTrabalhando] = useState(false);

  async function escolher() {
    setErro(undefined); setOk(undefined); setCad(undefined); setResumo(undefined); setErros([]);
    try {
      const bytes = await escolherArquivo();
      if (!bytes) return;
      setTrabalhando(true);
      const c = lerCadastrosFinanceiro(await lerXlsx(bytes));
      const sim = await simularCadastrosFinanceiro(financeiro, c);
      setCad(c); setResumo(sim.resumo); setErros(sim.erros);
    } catch (e) { setErro((e as Error).message); } finally { setTrabalhando(false); }
  }

  async function importar() {
    if (!cad) return;
    setErro(undefined); setTrabalhando(true);
    try {
      const sim = await simularCadastrosFinanceiro(financeiro, cad);
      if (sim.erros.length) { setErros(sim.erros); setResumo(sim.resumo); return; }
      const r = await importarCadastrosFinanceiro(financeiro, cad);
      setOk(`Importação concluída: ${linhasResumo(r).join('; ') || 'nada novo'}.`);
      setCad(undefined); setResumo(undefined);
      onAlterou?.();
    } catch (e) { setErro((e as Error).message); } finally { setTrabalhando(false); }
  }

  const novos = resumo ? linhasResumo(resumo) : [];
  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Cartao>
        <Text style={estilos.titulo}>Planilha de cadastros do financeiro</Text>
        <Text style={estilos.subtitulo}>
          Empresas, contas bancárias, centros de custo, frentes de serviço, fornecedores e tipos de despesa. O modelo já vem com ALN, Passos,
          as contas, os centros e as frentes da lista de presença. O app confere tudo antes de gravar e não duplica o que já existe.
        </Text>
        <Botao testID="baixar-modelo-fin" titulo="Baixar planilha modelo" secundario onPress={() => void Linking.openURL(URL_MODELO_FINANCEIRO)} />
        <Botao testID="escolher-planilha-fin" titulo={trabalhando ? 'Conferindo…' : 'Escolher planilha (.xlsx)'} desativado={trabalhando} onPress={() => void escolher()} />
      </Cartao>
      <Mensagem erro={erro} ok={ok} />
      {resumo && (
        <>
          <Text style={estilos.secao}>O que será importado</Text>
          <Cartao gap={4}>
            {novos.length === 0 && <Text style={estilos.subtitulo}>Nada novo para importar.</Text>}
            {novos.map((t) => <Text key={t} style={estilos.titulo}>{`• ${t}`}</Text>)}
            {resumo.existentes > 0 && <Text style={estilos.subtitulo}>{`${resumo.existentes} linha(s) já estão no app e ficam como estão (outros nomes novos são acrescentados).`}</Text>}
          </Cartao>
        </>
      )}
      {erros.length > 0 && (
        <>
          <Text style={[estilos.secao, { color: cores.erro }]}>{`Corrija na planilha (${erros.length})`}</Text>
          <Cartao gap={6}>
            {erros.slice(0, 100).map((e, i) => <Text key={i} testID={`erro-fin-${i}`} style={{ color: cores.erro }}>{`${e.aba}, linha ${e.linha}: ${e.mensagem}`}</Text>)}
            <Text style={estilos.subtitulo}>Nada foi gravado. Corrija, salve a planilha e escolha o arquivo de novo.</Text>
          </Cartao>
        </>
      )}
      {resumo && !erros.length && novos.length > 0 && (
        <Botao testID="confirmar-importacao-fin" titulo={trabalhando ? 'Importando…' : 'Importar agora'} desativado={trabalhando} onPress={() => void importar()} />
      )}
    </ScrollView>
  );
}
