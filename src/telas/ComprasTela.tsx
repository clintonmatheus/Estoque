import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import type { Comprovante, LojaEmAberto } from '../dados/compras';
import type { Financeiro } from '../dados/financeiro';
import { analisarDataBR, formatarDataBR } from '../domain/datas';
import { formatarMoeda, lerNumero } from '../domain/formato';
import { podeConferirOuPagar } from '../domain/pedidos';
import { NOME_STATUS_COMPRA, type Compra, type CentroCusto, type Fornecedor, type Local, type TipoDespesa } from '../domain/tipos';
import type { ServicoFotos } from '../fotos/servico';
import { Botao, Campo, Cartao, Chips, Mensagem, Seletor } from './componentes';
import { EntradaBoleto } from './EntradaBoleto';
import { cores, estilos } from './estilos';

interface Cad { lojas: Fornecedor[]; centros: CentroCusto[]; frentes: Local[]; tipos: TipoDespesa[] }
const VAZIO: Cad = { lojas: [], centros: [], frentes: [], tipos: [] };
const msgErro = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado');
const dataBR = (d: string) => { try { return formatarDataBR(d); } catch { return d; } };
const reais = formatarMoeda;

interface Props { financeiro: Financeiro; servicoFotos: ServicoFotos; hoje: string; versao?: number; onAlterou?: () => void }

/** Compras feitas a prazo nas lojas de fatura semanal; o pagador fecha a fatura e gera o pedido de pagamento. */
export function ComprasTela({ financeiro, servicoFotos, hoje, versao = 0, onAlterou }: Props) {
  const usuario = financeiro.usuario;
  const gestor = podeConferirOuPagar(usuario);
  const [cad, setCad] = useState<Cad>(VAZIO);
  const [abertas, setAbertas] = useState<LojaEmAberto[]>([]);
  const [todas, setTodas] = useState<Compra[]>([]);
  const [filtro, setFiltro] = useState<'abertas' | 'todas'>('abertas');
  const [tela, setTela] = useState<{ t: 'lista' } | { t: 'nova' } | { t: 'fechar'; lojaId: string }>({ t: 'lista' });
  const [rec, setRec] = useState(0);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string }>({});

  useEffect(() => {
    void Promise.all([financeiro.fornecedores(), financeiro.centros(), financeiro.frentes(), financeiro.tipos(), financeiro.compras.emAberto(), financeiro.compras.lista()])
      .then(([f, centros, frentes, tipos, ab, td]) => { setCad({ lojas: f.filter((x) => x.forma === 'fatura'), centros, frentes, tipos }); setAbertas(ab); setTodas(td); })
      .catch((e) => setMsg({ erro: msgErro(e) }));
  }, [financeiro, versao, rec]);

  const atualizar = (ok?: string) => { setRec((n) => n + 1); setMsg({ ok }); onAlterou?.(); };
  const nomeLoja = (id: string) => cad.lojas.find((l) => l.id === id)?.nome ?? '—';
  const nomeCentro = (id: string) => cad.centros.find((c) => c.id === id)?.nome ?? '—';
  const cancelar = async (c: Compra) => { try { await financeiro.compras.cancelar(c.id); atualizar('Compra cancelada.'); } catch (e) { setMsg({ erro: msgErro(e) }); } };

  if (tela.t === 'nova') {
    return <CompraForm financeiro={financeiro} cad={cad} servicoFotos={servicoFotos} hoje={hoje} onVoltar={() => setTela({ t: 'lista' })}
      onSalva={() => { atualizar('Compra lançada.'); setTela({ t: 'lista' }); }} />;
  }
  if (tela.t === 'fechar') {
    const loja = abertas.find((l) => l.fornecedor.id === tela.lojaId);
    if (loja) {
      return <FecharFatura financeiro={financeiro} loja={loja} servicoFotos={servicoFotos} hoje={hoje} onVoltar={() => setTela({ t: 'lista' })}
        onFechada={(codigo) => { atualizar(`Fatura enviada no pedido ${codigo}: confira em Pedidos.`); setTela({ t: 'lista' }); }} />;
    }
  }

  const linha = (c: Compra) => (
    <View key={c.id} style={{ gap: 2, borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 6 }}>
      <View style={estilos.linha}><Text style={[estilos.titulo, { flex: 1 }]}>{c.descricao}</Text><Text style={estilos.valor}>{reais(c.valor)}</Text></View>
      <Text style={estilos.subtitulo}>{dataBR(c.data)} · {nomeCentro(c.centroId)} · {c.criado.nome}{c.documento ? ` · nota ${c.documento}` : ''}</Text>
      {filtro === 'todas' && <Text style={{ color: c.status === 'cancelada' ? cores.suave : c.status === 'em_fatura' ? cores.primaria : cores.aviso, fontWeight: '700', fontSize: 13 }}>{NOME_STATUS_COMPRA[c.status]}</Text>}
      {c.status === 'aberta' && (gestor || c.criado.id === usuario.id) && (
        <Pressable testID={`cancelar-compra-${c.id}`} onPress={() => void cancelar(c)}><Text style={{ color: cores.erro, fontWeight: '600' }}>Cancelar compra</Text></Pressable>
      )}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Botao testID="nova-compra" titulo="+ Lançar compra a faturar" onPress={() => { setMsg({}); setTela({ t: 'nova' }); }} />
      <Mensagem {...msg} />
      <Chips prefixo="compras" valor={filtro} onMudar={setFiltro} opcoes={[{ id: 'abertas', titulo: 'Aguardando fatura' }, { id: 'todas', titulo: 'Todas' }]} />
      {cad.lojas.length === 0 && <Text style={estilos.subtitulo}>Nenhuma loja de fatura semanal cadastrada. Cadastre em Financeiro → Fornecedores (forma: Fatura semanal).</Text>}
      {filtro === 'abertas' ? (
        <>
          {abertas.length === 0 && <Text style={estilos.subtitulo}>Nenhuma compra aguardando fatura.</Text>}
          {abertas.map((l) => (
            <Cartao key={l.fornecedor.id}>
              <View style={estilos.linha}>
                <Text style={estilos.titulo}>{l.fornecedor.nome}</Text>
                <Text testID={`total-${l.fornecedor.id}`} style={estilos.valor}>{reais(l.total)}</Text>
              </View>
              <Text style={estilos.subtitulo}>{l.compras.length} compra(s){l.fornecedor.diaFechamento ? ` · fecha na ${l.fornecedor.diaFechamento}` : ''}</Text>
              {l.compras.map(linha)}
              {gestor && <Botao testID={`fechar-${l.fornecedor.id}`} titulo="Fechar fatura desta loja" onPress={() => { setMsg({}); setTela({ t: 'fechar', lojaId: l.fornecedor.id }); }} />}
            </Cartao>
          ))}
        </>
      ) : (
        <Cartao>
          {todas.length === 0 && <Text style={estilos.subtitulo}>Nenhuma compra lançada.</Text>}
          {todas.map((c) => <View key={c.id}><Text style={estilos.rotulo}>{nomeLoja(c.fornecedorId)}</Text>{linha(c)}</View>)}
        </Cartao>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------

function CompraForm({ financeiro, cad, servicoFotos, hoje, onVoltar, onSalva }: {
  financeiro: Financeiro; cad: Cad; servicoFotos: ServicoFotos; hoje: string; onVoltar: () => void; onSalva: () => void;
}) {
  const [lojaId, setLojaId] = useState<string>();
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(formatarDataBR(hoje));
  const [documento, setDocumento] = useState('');
  const [centroId, setCentroId] = useState<string>();
  const [frenteId, setFrenteId] = useState<string>();
  const [tipoId, setTipoId] = useState<string>();
  const [comprovante, setComprovante] = useState<Comprovante>();
  const [erro, setErro] = useState<string>();
  const frentes = useMemo(() => cad.frentes.filter((f) => f.centroId === centroId), [cad.frentes, centroId]);

  const foto = async () => { try { const uri = await servicoFotos.tirarFoto(); if (uri) setComprovante({ uri, formato: 'imagem', nome: 'Foto da nota' }); } catch (e) { setErro(msgErro(e)); } };
  const arquivo = async () => {
    try { const d = servicoFotos.escolherDocumento ? await servicoFotos.escolherDocumento() : await servicoFotos.escolherDaGaleria().then((uri) => uri ? { uri, nome: 'Foto', formato: 'imagem' as const } : undefined); if (d) setComprovante({ uri: d.uri, formato: d.formato, nome: d.nome }); } catch (e) { setErro(msgErro(e)); }
  };
  const salvar = async () => {
    setErro(undefined);
    try {
      const v = lerNumero(valor);
      if (!lojaId) throw new Error('Escolha a loja');
      if (v === undefined) throw new Error('Informe o valor da compra');
      if (!centroId) throw new Error('Escolha o centro de custo');
      await financeiro.compras.lancar({ fornecedorId: lojaId, descricao, valor: v, data: analisarDataBR(data), centroId, ...(frenteId ? { frenteId } : {}), ...(tipoId ? { tipoDespesaId: tipoId } : {}), ...(documento.trim() ? { documento } : {}) }, comprovante);
      onSalva();
    } catch (e) { setErro(msgErro(e) === 'Data inválida' ? 'Data da compra inválida (use dia/mês/ano)' : msgErro(e)); }
  };

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Pressable testID="voltar-compra" onPress={onVoltar}><Text style={{ color: cores.primaria, fontWeight: '600' }}>‹ Voltar</Text></Pressable>
      <Text style={estilos.titulo}>Lançar compra a faturar</Text>
      <Cartao>
        <Seletor testID="compra-loja" rotulo="Loja" valor={lojaId} opcoes={cad.lojas.map((l) => ({ id: l.id, titulo: l.nome, subtitulo: l.diaFechamento ? `Fecha na ${l.diaFechamento}` : undefined }))} onEscolher={setLojaId} />
        <Campo testID="compra-descricao" rotulo="O que foi comprado" value={descricao} onChangeText={setDescricao} />
        <Campo testID="compra-valor" rotulo="Valor (R$)" value={valor} onChangeText={setValor} keyboardType="decimal-pad" />
        <Campo testID="compra-data" rotulo="Data da compra" value={data} onChangeText={setData} />
        <Campo testID="compra-documento" rotulo="Nº da nota ou cupom (opcional)" value={documento} onChangeText={setDocumento} />
      </Cartao>
      <Cartao>
        <Text style={estilos.secao}>A quem pertence o custo</Text>
        <Seletor testID="compra-centro" rotulo="Centro de custo (obrigatório)" valor={centroId} opcoes={cad.centros.map((c) => ({ id: c.id, titulo: c.nome }))} onEscolher={(id) => { setCentroId(id); setFrenteId(undefined); }} />
        {centroId && frentes.length > 0 && <Seletor testID="compra-frente" rotulo="Frente de serviço (opcional)" valor={frenteId} vazio="Nenhuma" opcoes={frentes.map((f) => ({ id: f.id, titulo: f.nome }))} onEscolher={setFrenteId} />}
        <Seletor testID="compra-tipo" rotulo="Tipo de despesa (opcional)" valor={tipoId} vazio="Não sei" opcoes={cad.tipos.map((t) => ({ id: t.id, titulo: t.nome }))} onEscolher={setTipoId} />
      </Cartao>
      <Cartao>
        <Text style={estilos.secao}>Comprovante (obrigatório)</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Botao testID="compra-foto" secundario titulo="Fotografar a nota" onPress={() => void foto()} />
          <Botao testID="compra-arquivo" secundario titulo="Escolher arquivo" onPress={() => void arquivo()} />
        </View>
        {comprovante && <Text testID="comprovante-ok" style={{ color: cores.ok, fontWeight: '600' }}>Anexado: {comprovante.nome ?? comprovante.formato}</Text>}
      </Cartao>
      {erro && <Text testID="erro" style={estilos.erro}>{erro}</Text>}
      <Botao testID="salvar-compra" titulo="Lançar compra" onPress={() => void salvar()} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------

function FecharFatura({ financeiro, loja, servicoFotos, hoje, onVoltar, onFechada }: {
  financeiro: Financeiro; loja: LojaEmAberto; servicoFotos: ServicoFotos; hoje: string; onVoltar: () => void; onFechada: (codigo: string) => void;
}) {
  const f = loja.fornecedor;
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>(() => Object.fromEntries(loja.compras.map((c) => [c.id, true])));
  const escolhidas = loja.compras.filter((c) => marcadas[c.id]);
  const soma = Math.round(escolhidas.reduce((t, c) => t + c.valor, 0) * 100) / 100;
  const [valor, setValor] = useState('');
  const [tipo, setTipo] = useState<'boleto' | 'pix'>(f.chavePix && !f.documento ? 'pix' : 'boleto');
  const [boleto, setBoleto] = useState('');
  const [chavePix, setChavePix] = useState(f.chavePix ?? '');
  const [vencimento, setVencimento] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [anexos, setAnexos] = useState<{ uri: string; formato: 'imagem' | 'pdf' | 'xml'; nome?: string }[]>([]);
  const [erro, setErro] = useState<string>();
  const valorFatura = lerNumero(valor) ?? soma;
  const diferente = Math.abs(valorFatura - soma) > 0.005;
  const sugestao = valor === '' ? String(soma).replace('.', ',') : valor;

  const anexar = async () => {
    try { const d = servicoFotos.escolherDocumento ? await servicoFotos.escolherDocumento() : undefined; if (d) setAnexos((a) => [...a, { uri: d.uri, formato: d.formato, nome: d.nome }]); } catch (e) { setErro(msgErro(e)); }
  };
  const fechar = async () => {
    setErro(undefined);
    try {
      if (!escolhidas.length) throw new Error('Marque ao menos uma compra');
      let venc: string | undefined;
      if (vencimento.trim()) { try { venc = analisarDataBR(vencimento); } catch { throw new Error('Vencimento inválido (use dia/mês/ano)'); } }
      const p = await financeiro.pedidos.solicitar({
        tipo, descricao: `Fatura ${f.nome} — ${escolhidas.length} compra(s)`, valor: valorFatura, fornecedorId: f.id,
        ...(tipo === 'boleto' ? { boleto } : { chavePix }), ...(venc ? { vencimento: venc } : {}),
        fatura: { compras: escolhidas.map((c) => c.id), ...(justificativa.trim() ? { justificativa } : {}) },
      });
      for (const a of anexos) await financeiro.pedidos.anexarArquivo(p.id, a);
      onFechada(p.codigo);
    } catch (e) { setErro(msgErro(e)); }
  };

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Pressable testID="voltar-fatura" onPress={onVoltar}><Text style={{ color: cores.primaria, fontWeight: '600' }}>‹ Voltar</Text></Pressable>
      <Text style={estilos.titulo}>Fechar fatura · {f.nome}</Text>
      <Cartao>
        <Text style={estilos.secao}>Compras da fatura</Text>
        {loja.compras.map((c) => (
          <View key={c.id} style={estilos.linha}>
            <View style={{ flex: 1 }}><Text style={estilos.titulo}>{c.descricao}</Text><Text style={estilos.subtitulo}>{dataBR(c.data)} · {reais(c.valor)}</Text></View>
            <Switch testID={`marcar-${c.id}`} value={!!marcadas[c.id]} onValueChange={(v) => setMarcadas((m) => ({ ...m, [c.id]: v }))} />
          </View>
        ))}
        <Text testID="soma-compras" style={estilos.valor}>Soma das compras: {reais(soma)}</Text>
      </Cartao>
      <Cartao>
        <Text style={estilos.secao}>Cobrança da loja</Text>
        <Campo testID="fatura-valor" rotulo="Valor da fatura (R$)" value={valor} placeholder={sugestao} onChangeText={setValor} keyboardType="decimal-pad" />
        {diferente && <Campo testID="fatura-justificativa" rotulo={`Diferença de ${reais(Math.abs(valorFatura - soma))}: explique (frete, juros, item sem lançamento…)`} value={justificativa} onChangeText={setJustificativa} />}
        <Chips prefixo="fatura-tipo" valor={tipo} onMudar={setTipo} opcoes={[{ id: 'boleto', titulo: 'Boleto' }, { id: 'pix', titulo: 'Pix' }]} />
        {tipo === 'boleto'
          ? <EntradaBoleto valor={boleto} onMudar={setBoleto} hoje={hoje} servicoFotos={servicoFotos}
              onPdf={(d) => setAnexos((x) => x.some((y) => y.uri === d.uri) ? x : [...x, { uri: d.uri, formato: 'pdf', nome: d.nome }])}
              onLido={(b) => { if (b.valor !== undefined && valor === '') setValor(String(b.valor).replace('.', ',')); if (b.vencimento) setVencimento(formatarDataBR(b.vencimento)); }} />
          : <Campo testID="fatura-pix" rotulo="Chave Pix" value={chavePix} onChangeText={setChavePix} autoCapitalize="none" />}
        <Campo testID="fatura-vencimento" rotulo="Vencimento" placeholder="dd/mm/aaaa" value={vencimento} onChangeText={setVencimento} />
        <Botao testID="anexar-fatura" secundario titulo="Anexar a fatura da loja (PDF ou foto)" onPress={() => void anexar()} />
        {anexos.map((a, i) => <Text key={a.uri + i} style={estilos.subtitulo}>• {a.nome ?? a.formato}</Text>)}
      </Cartao>
      {erro && <Text testID="erro" style={estilos.erro}>{erro}</Text>}
      <Botao testID="enviar-fatura" titulo="Gerar pedido de pagamento da fatura" onPress={() => void fechar()} />
    </ScrollView>
  );
}
