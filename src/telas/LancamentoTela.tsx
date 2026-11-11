import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import type { Estoque, Lancamento } from '../dados/estoque';
import { analisarDataBR, formatarDataBR } from '../domain/datas';
import type { Posicao } from '../domain/estoque';
import { formatarMoeda, formatarQuantidade, lerNumero, paraUnidadeBase } from '../domain/formato';
import type { Funcionario, Item, Local } from '../domain/tipos';
import type { ServicoFotos } from '../fotos/servico';
import { NOME_TIPO } from '../relatorios/relatorios';
import { Botao, Campo, Cartao, ListaEscolha, Mensagem, Seletor } from './componentes';
import { cores, estilos } from './estilos';

type Tipo = Lancamento['tipo'];

interface Linha { chave: number; itemId: string; qtd: string; emEmbalagem: boolean; custo: string }

interface Props {
  estoque: Estoque;
  tipo: Tipo;
  hoje: string;
  servicoFotos: ServicoFotos;
  versao?: number;
  onSalvo?: () => void;
}

const DICA: Record<Tipo, string> = {
  entrada: 'Compra com nota fiscal (ou sobra sem obra de origem) entrando no galpão.',
  saida: 'Material saindo do galpão para uma frente de serviço.',
  devolucao: 'Sobra voltando de uma frente de serviço para o galpão. O valor é abatido da frente.',
  transferencia: 'Material passando de uma frente para outra, sem voltar ao galpão.',
};

const opcaoLocal = (l: Local) => ({ id: l.id, titulo: l.nome, subtitulo: l.centroCusto });

let chaves = 0;

export function LancamentoTela({ estoque, tipo, hoje, servicoFotos, versao = 0, onSalvo }: Props) {
  const [itens, setItens] = useState<Item[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [posicao, setPosicao] = useState<Posicao>();
  const [data, setData] = useState(formatarDataBR(hoje));
  const [nf, setNf] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [localId, setLocalId] = useState<string>();
  const [destinoId, setDestinoId] = useState<string>();
  const [funcionarioId, setFuncionarioId] = useState<string>();
  const [obs, setObs] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [fotos, setFotos] = useState<string[]>([]);
  const [escolhendo, setEscolhendo] = useState(false);
  const [erro, setErro] = useState<string>();
  const [ok, setOk] = useState<string>();
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const [i, l, f, p] = await Promise.all([estoque.itens(), estoque.locais(), estoque.funcionarios(), estoque.posicao()]);
      if (!ativo) return;
      setItens(i); setLocais(l); setFuncionarios(f); setPosicao(p);
    })();
    return () => { ativo = false; };
  }, [estoque, versao]);

  const item = (id: string) => itens.find((i) => i.id === id);

  function adicionar(itemId: string) {
    setEscolhendo(false);
    setOk(undefined);
    const ultimo = posicao?.itens[itemId]?.ultimoCusto ?? item(itemId)?.custoReferencia;
    setLinhas((ls) => [...ls, { chave: ++chaves, itemId, qtd: '', emEmbalagem: false, custo: tipo === 'entrada' && ultimo ? String(ultimo).replace('.', ',') : '' }]);
  }
  const mudar = (chave: number, campo: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...campo } : l)));

  /** Quantidade que a frente de origem tem (devolução/transferência) ou o saldo do galpão. */
  function disponivel(it: Item): string {
    if ((tipo === 'devolucao' || tipo === 'transferencia') && localId) {
      return `Na frente: ${formatarQuantidade(it, posicao?.locais[localId]?.[it.id]?.quantidade ?? 0)}`;
    }
    return `Saldo no galpão: ${formatarQuantidade(it, posicao?.itens[it.id]?.quantidade ?? 0)}`;
  }

  async function anexar(origem: 'camera' | 'galeria') {
    const uri = origem === 'camera' ? await servicoFotos.tirarFoto() : await servicoFotos.escolherDaGaleria();
    if (uri) setFotos((f) => [...f, uri]);
  }

  async function salvar() {
    setErro(undefined); setOk(undefined);
    try {
      const dataIso = analisarDataBR(data);
      if (dataIso > hoje) throw new Error('A data não pode ser futura');
      const l: Lancamento = {
        tipo, data: dataIso, notaFiscal: nf, fornecedor, localId, localDestinoId: destinoId, funcionarioId, observacao: obs,
        linhas: linhas.map((ln) => {
          const it = item(ln.itemId)!;
          const q = lerNumero(ln.qtd);
          if (q === undefined || q <= 0) throw new Error(`Informe a quantidade de ${it.nome}`);
          const linha = { itemId: ln.itemId, quantidade: paraUnidadeBase(it, q, ln.emEmbalagem) };
          if (tipo !== 'entrada') return linha;
          const c = lerNumero(ln.custo);
          if (c === undefined || c < 0) throw new Error(`Informe o valor unitário de ${it.nome}`);
          return { ...linha, custoUnitario: ln.emEmbalagem && it.embalagem ? c / it.embalagem.fator : c };
        }),
      };
      setSalvando(true);
      const movs = await estoque.lancar(l);
      for (const uri of fotos) await estoque.anexarFoto(movs[0].grupo, uri);
      setLinhas([]); setFotos([]); setNf(''); setFornecedor(''); setObs('');
      setOk(`${NOME_TIPO[tipo]} registrada (${movs.length} ${movs.length === 1 ? 'item' : 'itens'}).`);
      setPosicao(await estoque.posicao());
      onSalvo?.();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const total = tipo === 'entrada'
    ? linhas.reduce((t, ln) => t + (lerNumero(ln.qtd) ?? 0) * (lerNumero(ln.custo) ?? 0), 0)
    : undefined;
  const opcoesItens = itens.map((i) => ({ id: i.id, titulo: i.nome, subtitulo: disponivel(i) }));

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Text style={estilos.subtitulo}>{DICA[tipo]}</Text>
      <Cartao>
        <Campo testID="data" rotulo="Data" value={data} onChangeText={setData} keyboardType="numbers-and-punctuation" placeholder="dd/mm/aaaa" />
        {tipo === 'entrada' && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Campo testID="nota" rotulo="Nota fiscal" value={nf} onChangeText={setNf} style={{ flex: 1 }} placeholder="Opcional" />
            <Campo testID="fornecedor" rotulo="Fornecedor" value={fornecedor} onChangeText={setFornecedor} style={{ flex: 2 }} placeholder="Opcional" />
          </View>
        )}
        {tipo !== 'entrada' && (
          <Seletor testID="local" rotulo={tipo === 'saida' ? 'Frente de serviço (destino)' : 'Frente de serviço (origem)'}
            valor={localId} opcoes={locais.map(opcaoLocal)} onEscolher={setLocalId} />
        )}
        {tipo === 'transferencia' && (
          <Seletor testID="destino" rotulo="Frente de serviço (destino)" valor={destinoId}
            opcoes={locais.filter((l) => l.id !== localId).map(opcaoLocal)} onEscolher={setDestinoId} />
        )}
        {(tipo === 'saida' || tipo === 'devolucao') && (
          <Seletor testID="funcionario" rotulo={tipo === 'saida' ? 'Quem retirou' : 'Quem devolveu (opcional)'} valor={funcionarioId}
            opcoes={funcionarios.map((f) => ({ id: f.id, titulo: f.nome }))} onEscolher={setFuncionarioId} />
        )}
      </Cartao>

      <Text style={estilos.secao}>Itens</Text>
      {linhas.map((ln) => {
        const it = item(ln.itemId);
        if (!it) return null;
        return (
          <Cartao key={ln.chave}>
            <View style={estilos.linha}>
              <View style={{ flex: 1 }}>
                <Text style={estilos.titulo}>{it.nome}</Text>
                <Text style={estilos.subtitulo}>{disponivel(it)}</Text>
              </View>
              <Pressable testID={`remover-${it.id}`} hitSlop={10} onPress={() => setLinhas((ls) => ls.filter((x) => x.chave !== ln.chave))}>
                <Text style={{ color: cores.erro, fontSize: 18 }}>✕</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <Campo testID={`qtd-${it.id}`} rotulo={`Quantidade (${ln.emEmbalagem && it.embalagem ? it.embalagem.nome : it.unidade})`}
                value={ln.qtd} onChangeText={(v) => mudar(ln.chave, { qtd: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
              {tipo === 'entrada' && (
                <Campo testID={`custo-${it.id}`} rotulo={`Valor unit. (R$/${ln.emEmbalagem && it.embalagem ? it.embalagem.nome : it.unidade})`}
                  value={ln.custo} onChangeText={(v) => mudar(ln.chave, { custo: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
              )}
            </View>
            {it.embalagem && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[false, true].map((emb) => (
                  <Pressable key={String(emb)} testID={`unidade-${it.id}-${emb ? 'emb' : 'base'}`} onPress={() => mudar(ln.chave, { emEmbalagem: emb })}
                    style={[estilos.chip, ln.emEmbalagem === emb && estilos.chipAtivo]}>
                    <Text style={[estilos.chipTexto, ln.emEmbalagem === emb && estilos.chipTextoAtivo]}>
                      {emb ? `${it.embalagem!.nome} (${it.embalagem!.fator} ${it.unidade})` : it.unidade}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Cartao>
        );
      })}
      <Botao testID="adicionar-item" titulo="+ Adicionar item" secundario onPress={() => setEscolhendo(true)} />
      <ListaEscolha visivel={escolhendo} titulo="Escolha o item" opcoes={opcoesItens} testID="item"
        onEscolher={adicionar} onFechar={() => setEscolhendo(false)} />
      {total !== undefined && linhas.length > 0 && <Text testID="total" style={estilos.valor}>{`Total: ${formatarMoeda(total)}`}</Text>}

      {tipo !== 'entrada' && (
        <>
          <Text style={estilos.secao}>Foto do pedido (opcional)</Text>
          <Cartao>
            <Text style={estilos.subtitulo}>Ex.: foto enviada pelo WhatsApp quando a almoxarife não estava no galpão.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {fotos.map((u) => <Image key={u} source={{ uri: u }} style={{ width: 72, height: 72, borderRadius: 8 }} />)}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Botao testID="foto-galeria" titulo="Da galeria" secundario onPress={() => void anexar('galeria')} />
              <Botao testID="foto-camera" titulo="Câmera" secundario onPress={() => void anexar('camera')} />
            </View>
          </Cartao>
        </>
      )}

      <Campo testID="obs" rotulo="Observação" value={obs} onChangeText={setObs} placeholder="Opcional" multiline />
      <Mensagem erro={erro} ok={ok} />
      <Botao testID="salvar" titulo={salvando ? 'Salvando…' : `Registrar ${NOME_TIPO[tipo].toLowerCase()}`} desativado={salvando} onPress={() => void salvar()} />
    </ScrollView>
  );
}
