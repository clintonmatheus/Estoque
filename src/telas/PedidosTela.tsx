import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import type { Financeiro } from '../dados/financeiro';
import type { DadosPagamento, NovoPedido } from '../dados/pedidos';
import { analisarDataBR, formatarDataBR } from '../domain/datas';
import { formatarMoeda, lerNumero } from '../domain/formato';
import { lerNotaXml } from '../domain/nota';
import { soNumeros } from '../domain/nomes';
import { ordemDePagamento, podeAprovar, podeConferirOuPagar, podeEditar, prazoDoPedido, type Prazo } from '../domain/pedidos';
import {
  ehAdminFinanceiro, NOME_STATUS_PEDIDO, NOME_TIPO_PEDIDO, type Anexo, type CentroCusto, type ContaBancaria, type Empresa, type Fornecedor, type Local, type Pedido, type TipoDespesa, type TipoPedido,
} from '../domain/tipos';
import type { DocumentoEscolhido, ServicoFotos } from '../fotos/servico';
import { Botao, Campo, Cartao, Chips, Mensagem, Seletor } from './componentes';
import { EntradaBoleto } from './EntradaBoleto';
import { cores, estilos } from './estilos';

type Filtro = 'conferir' | 'aprovar' | 'pagar' | 'todos' | 'abertos';

interface Cadastros { empresas: Empresa[]; contas: ContaBancaria[]; centros: CentroCusto[]; frentes: Local[]; fornecedores: Fornecedor[]; tipos: TipoDespesa[] }
const VAZIO: Cadastros = { empresas: [], contas: [], centros: [], frentes: [], fornecedores: [], tipos: [] };

const NOME_PRAZO: Record<Prazo, string> = { vencido: 'Vencido', hoje: 'Vence hoje', amanha: 'Vence amanhã', semana: 'Vence nesta semana', depois: '', sem: '' };
const COR_STATUS: Record<Pedido['status'], string> = { enviado: cores.aviso, aprovacao: cores.aviso, pronto: cores.primaria, pago: cores.ok, devolvido: cores.erro, rejeitado: cores.erro, cancelado: cores.suave };
const NOME_ACAO: Record<string, string> = { enviou: 'enviou', reenviou: 'reenviou', editou: 'editou', conferiu: 'conferiu', aprovou: 'aprovou', devolveu: 'devolveu', rejeitou: 'rejeitou', cancelou: 'cancelou', pagou: 'pagou' };
const reais = (v: number) => formatarMoeda(v);
const dataBR = (d?: string) => { try { return d ? formatarDataBR(d) : ''; } catch { return d ?? ''; } };
const msgErro = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado');

interface Props { financeiro: Financeiro; servicoFotos: ServicoFotos; hoje: string; versao?: number; onAlterou?: () => void }

/** Pedidos de pagamento: lista por papel, abertura, conferência, aprovação e pagamento. */
export function PedidosTela({ financeiro, servicoFotos, hoje, versao = 0, onAlterou }: Props) {
  const usuario = financeiro.usuario;
  const gestor = podeConferirOuPagar(usuario);
  const [filtro, setFiltro] = useState<Filtro>(gestor ? 'conferir' : 'abertos');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cad, setCad] = useState<Cadastros>(VAZIO);
  const [tela, setTela] = useState<{ t: 'lista' } | { t: 'novo'; editar?: Pedido } | { t: 'ver'; id: string }>({ t: 'lista' });
  const [recarregar, setRecarregar] = useState(0);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string }>({});

  useEffect(() => {
    void Promise.all([
      financeiro.pedidos.lista(), financeiro.empresas(), financeiro.contas(), financeiro.centros(), financeiro.frentes(), financeiro.fornecedores(), financeiro.tipos(),
    ]).then(([p, empresas, contas, centros, frentes, fornecedores, tipos]) => { setPedidos(p); setCad({ empresas, contas, centros, frentes, fornecedores, tipos }); })
      .catch((e) => setMsg({ erro: msgErro(e) }));
  }, [financeiro, versao, recarregar]);

  const atualizar = useCallback((ok?: string) => { setRecarregar((n) => n + 1); setMsg({ ok }); onAlterou?.(); }, [onAlterou]);
  const nomeCentro = (id: string) => cad.centros.find((c) => c.id === id)?.nome ?? '—';

  if (tela.t === 'novo') {
    return <PedidoForm financeiro={financeiro} cad={cad} servicoFotos={servicoFotos} hoje={hoje} pedido={tela.editar} pedidos={pedidos}
      onVoltar={() => setTela(tela.editar ? { t: 'ver', id: tela.editar.id } : { t: 'lista' })}
      onSalvo={(p) => { atualizar(`Pedido ${p.codigo} enviado.`); setTela({ t: 'lista' }); }} />;
  }
  if (tela.t === 'ver') {
    const p = pedidos.find((x) => x.id === tela.id);
    if (p) {
      return <PedidoDetalhe financeiro={financeiro} cad={cad} servicoFotos={servicoFotos} hoje={hoje} pedido={p} versao={recarregar}
        onVoltar={() => setTela({ t: 'lista' })} onEditar={() => setTela({ t: 'novo', editar: p })}
        onMudou={(ok, fechar) => { atualizar(ok); if (fechar) setTela({ t: 'lista' }); }} />;
    }
  }

  const cont = {
    conferir: pedidos.filter((p) => p.status === 'enviado').length,
    aprovar: pedidos.filter((p) => p.status === 'aprovacao').length,
    pagar: pedidos.filter((p) => p.status === 'pronto').length,
  };
  const visiveis = pedidos.filter((p) => {
    if (filtro === 'conferir') return p.status === 'enviado';
    if (filtro === 'aprovar') return p.status === 'aprovacao';
    if (filtro === 'pagar') return p.status === 'pronto';
    if (filtro === 'abertos') return ['enviado', 'aprovacao', 'pronto', 'devolvido'].includes(p.status);
    return true;
  }).sort(filtro === 'pagar' ? ordemDePagamento : (a, b) => b.criado.em.localeCompare(a.criado.em));
  const opcoes: { id: Filtro; titulo: string }[] = gestor
    ? [{ id: 'conferir', titulo: `A conferir (${cont.conferir})` }, { id: 'aprovar', titulo: `A aprovar (${cont.aprovar})` }, { id: 'pagar', titulo: `A pagar (${cont.pagar})` }, { id: 'todos', titulo: 'Todos' }]
    : [{ id: 'abertos', titulo: 'Em andamento' }, { id: 'todos', titulo: 'Todos' }];

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Botao testID="novo-pedido" titulo="+ Novo pedido de pagamento" onPress={() => { setMsg({}); setTela({ t: 'novo' }); }} />
      <Mensagem {...msg} />
      <Chips prefixo="pedidos" valor={filtro} onMudar={setFiltro} opcoes={opcoes} />
      {visiveis.length === 0 && <Text style={estilos.subtitulo}>Nenhum pedido aqui.</Text>}
      {visiveis.map((p) => {
        const prazo = p.status === 'pronto' || p.status === 'enviado' || p.status === 'aprovacao' ? prazoDoPedido(p, hoje) : 'sem';
        return (
          <Pressable key={p.id} testID={`pedido-${p.id}`} onPress={() => { setMsg({}); setTela({ t: 'ver', id: p.id }); }} style={estilos.card}>
            <View style={estilos.linha}>
              <Text style={estilos.titulo}>{p.codigo} · {p.favorecido}</Text>
              <Text style={estilos.valor}>{reais(p.valor)}</Text>
            </View>
            <Text style={estilos.subtitulo}>{NOME_TIPO_PEDIDO[p.tipo]} · {p.descricao}</Text>
            <Text style={estilos.subtitulo}>{nomeCentro(p.centroId)}{p.vencimento ? ` · vence ${dataBR(p.vencimento)}` : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <Text style={{ color: COR_STATUS[p.status], fontWeight: '700', fontSize: 13 }}>{NOME_STATUS_PEDIDO[p.status]}</Text>
              {p.urgente && <Text style={{ color: cores.erro, fontWeight: '700', fontSize: 13 }}>URGENTE</Text>}
              {NOME_PRAZO[prazo] !== '' && <Text style={{ color: prazo === 'vencido' ? cores.erro : cores.aviso, fontWeight: '700', fontSize: 13 }}>{NOME_PRAZO[prazo]}</Text>}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------

interface AnexoPendente { uri: string; formato: NonNullable<Anexo['formato']>; nome?: string }

function PedidoForm({ financeiro, cad, servicoFotos, hoje, pedido, pedidos, onVoltar, onSalvo }: {
  financeiro: Financeiro; cad: Cadastros; servicoFotos: ServicoFotos; hoje: string; pedido?: Pedido; pedidos: Pedido[]; onVoltar: () => void; onSalvo: (p: Pedido) => void;
}) {
  const [tipo, setTipo] = useState<TipoPedido>(pedido?.tipo ?? 'pix');
  const [fornecedorId, setFornecedorId] = useState(pedido?.fornecedorId);
  const [favorecido, setFavorecido] = useState(pedido && !pedido.fornecedorId ? pedido.favorecido ?? '' : '');
  const [chavePix, setChavePix] = useState(pedido?.chavePix ?? '');
  const [boleto, setBoleto] = useState(pedido?.boleto ?? '');
  const [reembolsoDe, setReembolsoDe] = useState(pedido?.reembolsoDe ?? '');
  const [descricao, setDescricao] = useState(pedido?.descricao ?? '');
  const [valor, setValor] = useState(pedido ? String(pedido.valor).replace('.', ',') : '');
  const [centroId, setCentroId] = useState(pedido?.centroId);
  const [frenteId, setFrenteId] = useState(pedido?.frenteId);
  const [tipoDespesaId, setTipoDespesaId] = useState(pedido?.tipoDespesaId);
  const [vencimento, setVencimento] = useState(pedido?.vencimento ? formatarDataBR(pedido.vencimento) : '');
  const [urgente, setUrgente] = useState(!!pedido?.urgente);
  const [nota, setNota] = useState<Pedido['nota']>(pedido?.nota);
  const [anexos, setAnexos] = useState<AnexoPendente[]>([]);
  const [info, setInfo] = useState<string>();
  const [erro, setErro] = useState<string>();
  const [duplicado, setDuplicado] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const frentes = useMemo(() => cad.frentes.filter((f) => f.centroId === centroId), [cad.frentes, centroId]);
  const escolherFornecedor = (id: string) => {
    const f = cad.fornecedores.find((x) => x.id === id);
    setFornecedorId(id);
    if (f?.chavePix && !chavePix) setChavePix(f.chavePix);
  };

  const anexar = async () => {
    setErro(undefined);
    try {
      const d: DocumentoEscolhido | undefined = servicoFotos.escolherDocumento ? await servicoFotos.escolherDocumento() : undefined;
      if (!d) { if (!servicoFotos.escolherDocumento) setErro('Este aparelho não consegue escolher arquivos.'); return; }
      setAnexos((a) => [...a, { uri: d.uri, formato: d.formato, nome: d.nome }]);
      if (d.formato === 'xml' && d.texto) {
        const n = lerNotaXml(d.texto);
        const forn = cad.fornecedores.find((f) => f.documento && soNumeros(f.documento) === soNumeros(n.emitente.documento));
        const emp = cad.empresas.find((e) => e.cnpj && n.destinatario && soNumeros(e.cnpj) === soNumeros(n.destinatario.documento));
        if (forn) { setFornecedorId(forn.id); if (forn.chavePix && !chavePix) setChavePix(forn.chavePix); } else setFavorecido(n.emitente.nome);
        const dup = n.duplicatas[0];
        setValor(String((dup?.valor ?? n.valor)).replace('.', ','));
        if (dup?.vencimento) setVencimento(formatarDataBR(dup.vencimento));
        if (!descricao.trim()) setDescricao(`NF ${n.numero} — ${n.emitente.nome}`);
        setNota({ numero: n.numero, chave: n.chave, emissao: n.emissao, ...(n.destinatario ? { destinatario: n.destinatario.documento } : {}) });
        setInfo(`${n.tipo === 'nfse' ? 'NFS-e' : 'NF-e'} ${n.numero} lida: ${n.emitente.nome}, ${reais(n.valor)}${n.duplicatas.length > 1 ? `. Há ${n.duplicatas.length} parcelas na nota: este pedido usa a primeira, abra um pedido por parcela.` : ''}${emp ? ` Destinatário: ${emp.apelido}.` : ''}`);
      }
    } catch (e) { setErro(msgErro(e)); }
  };

  const enviar = async (confirmarDuplicado = false) => {
    setErro(undefined);
    if (!centroId) { setErro('Escolha o centro de custo'); return; }
    const v = lerNumero(valor);
    if (v === undefined || !(v > 0)) { setErro('Informe o valor do pedido'); return; }
    let venc: string | undefined;
    if (vencimento.trim()) { try { venc = analisarDataBR(vencimento); } catch { setErro('Vencimento inválido (use dia/mês/ano)'); return; } }
    const novo: NovoPedido = {
      ...(pedido ? { id: pedido.id } : {}), tipo, descricao, valor: v, centroId,
      ...(frenteId ? { frenteId } : {}), ...(tipoDespesaId ? { tipoDespesaId } : {}),
      ...(fornecedorId ? { fornecedorId } : {}), ...(favorecido.trim() ? { favorecido } : {}),
      ...(tipo !== 'boleto' && chavePix.trim() ? { chavePix } : {}), ...(tipo === 'boleto' ? { boleto } : {}),
      ...(tipo === 'reembolso' ? { reembolsoDe } : {}),
      ...(venc ? { vencimento: venc } : {}), ...(urgente ? { urgente: true } : {}), ...(nota ? { nota } : {}),
    };
    setSalvando(true);
    try {
      const p = await financeiro.pedidos.solicitar(novo, { confirmarDuplicado });
      for (const a of anexos) await financeiro.pedidos.anexarArquivo(p.id, a);
      onSalvo(p);
    } catch (e) {
      const m = msgErro(e);
      if (m.startsWith('DUPLICADO:')) { setDuplicado(true); setErro(m.replace('DUPLICADO: ', 'Atenção: ')); } else setErro(m);
    } finally { setSalvando(false); }
  };

  void pedidos;
  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Pressable testID="voltar-pedido" onPress={onVoltar}><Text style={{ color: cores.primaria, fontWeight: '600' }}>‹ Voltar</Text></Pressable>
      <Text style={estilos.titulo}>{pedido ? `Corrigir pedido ${pedido.codigo}` : 'Novo pedido de pagamento'}</Text>
      <Chips prefixo="tipo-pedido" valor={tipo} onMudar={(t) => { setTipo(t); setDuplicado(false); }}
        opcoes={(['pix', 'boleto', 'reembolso'] as TipoPedido[]).map((t) => ({ id: t, titulo: NOME_TIPO_PEDIDO[t] }))} />

      <Cartao>
        <Text style={estilos.secao}>Documentos</Text>
        <Botao testID="anexar-documento" secundario titulo="Anexar nota, boleto ou comprovante (XML, PDF, foto)" onPress={() => void anexar()} />
        {anexos.map((a, i) => <Text key={a.uri + i} style={estilos.subtitulo}>• {a.nome ?? a.formato}</Text>)}
        {info && <Text testID="info-nota" style={{ color: cores.ok, fontWeight: '600' }}>{info}</Text>}
      </Cartao>

      <Cartao>
        <Text style={estilos.secao}>Quem recebe</Text>
        <Seletor testID="pedido-fornecedor" rotulo="Fornecedor (opcional)" valor={fornecedorId} vazio="Outro / sem cadastro"
          opcoes={cad.fornecedores.map((f) => ({ id: f.id, titulo: f.nome, subtitulo: f.documento }))} onEscolher={escolherFornecedor} />
        {!fornecedorId && <Campo testID="pedido-favorecido" rotulo="Nome de quem recebe" value={favorecido} onChangeText={setFavorecido} />}
        {tipo === 'reembolso' && <Campo testID="pedido-reembolso-de" rotulo="Quem gastou o dinheiro" value={reembolsoDe} onChangeText={setReembolsoDe} />}
        {tipo !== 'boleto' && <Campo testID="pedido-pix" rotulo="Chave Pix" value={chavePix} onChangeText={setChavePix} autoCapitalize="none" />}
        {tipo === 'boleto' && (
          <>
            <EntradaBoleto valor={boleto} onMudar={setBoleto} hoje={hoje} servicoFotos={servicoFotos}
              onPdf={(d) => setAnexos((x) => x.some((y) => y.uri === d.uri) ? x : [...x, { uri: d.uri, formato: 'pdf', nome: d.nome }])}
              onLido={(b) => { if (b.valor !== undefined) setValor(String(b.valor).replace('.', ',')); if (b.vencimento) setVencimento(formatarDataBR(b.vencimento)); }} />
          </>
        )}
      </Cartao>

      <Cartao>
        <Text style={estilos.secao}>Pagamento</Text>
        <Campo testID="pedido-descricao" rotulo="Descrição (o que está sendo pago)" value={descricao} onChangeText={setDescricao} />
        <Campo testID="pedido-valor" rotulo="Valor (R$)" value={valor} onChangeText={setValor} keyboardType="decimal-pad" />
        <Campo testID="pedido-vencimento" rotulo={tipo === 'boleto' ? 'Vencimento' : 'Pagar até (opcional)'} placeholder="dd/mm/aaaa" value={vencimento} onChangeText={setVencimento} />
        <View style={estilos.linha}><Text style={estilos.titulo}>Urgente</Text><Switch testID="pedido-urgente" value={urgente} onValueChange={setUrgente} /></View>
      </Cartao>

      <Cartao>
        <Text style={estilos.secao}>A quem pertence o custo</Text>
        <Seletor testID="pedido-centro" rotulo="Centro de custo (obrigatório)" valor={centroId} opcoes={cad.centros.map((c) => ({ id: c.id, titulo: c.nome }))}
          onEscolher={(id) => { setCentroId(id); setFrenteId(undefined); }} />
        {centroId && frentes.length > 0 && (
          <Seletor testID="pedido-frente" rotulo="Frente de serviço (opcional)" valor={frenteId} vazio="Nenhuma" opcoes={frentes.map((f) => ({ id: f.id, titulo: f.nome }))} onEscolher={setFrenteId} />
        )}
        <Seletor testID="pedido-tipo-despesa" rotulo="Tipo de despesa (opcional)" valor={tipoDespesaId} vazio="Não sei" opcoes={cad.tipos.map((t) => ({ id: t.id, titulo: t.nome }))} onEscolher={setTipoDespesaId} />
      </Cartao>

      {erro && <Text testID="erro" style={estilos.erro}>{erro}</Text>}
      {duplicado
        ? <Botao testID="confirmar-duplicado" titulo="É outro pagamento: enviar mesmo assim" desativado={salvando} onPress={() => void enviar(true)} />
        : <Botao testID="enviar-pedido" titulo={pedido ? 'Reenviar pedido' : 'Enviar pedido'} desativado={salvando} onPress={() => void enviar()} />}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------

function PedidoDetalhe({ financeiro, cad, servicoFotos, hoje, pedido: p, versao, onVoltar, onEditar, onMudou }: {
  financeiro: Financeiro; cad: Cadastros; servicoFotos: ServicoFotos; hoje: string; pedido: Pedido; versao: number;
  onVoltar: () => void; onEditar: () => void; onMudou: (ok: string, fechar?: boolean) => void;
}) {
  const u = financeiro.usuario;
  const admin = ehAdminFinanceiro(u);
  const gestor = podeConferirOuPagar(u);
  const meu = p.criado.id === u.id;
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string>();
  const [centroId, setCentroId] = useState(p.centroId);
  const [frenteId, setFrenteId] = useState<string | null | undefined>(p.frenteId);
  const [tipoDespesaId, setTipoDespesaId] = useState(p.tipoDespesaId);
  const [pagando, setPagando] = useState(false);

  useEffect(() => { void financeiro.pedidos.anexos(p.id).then(setAnexos); }, [financeiro, p.id, versao]);

  const nome = (lista: { id: string; nome?: string; apelido?: string }[], id?: string) => lista.find((x) => x.id === id)?.nome ?? lista.find((x) => x.id === id)?.apelido ?? '—';
  const agir = async (fn: () => Promise<unknown>, ok: string, fechar = true) => {
    setErro(undefined);
    try { await fn(); onMudou(ok, fechar); } catch (e) { setErro(msgErro(e)); }
  };
  const frentes = cad.frentes.filter((f) => f.centroId === centroId);
  const podeConferir = gestor && p.status === 'enviado' && (admin || !meu);
  const podeLiberar = p.status === 'aprovacao' && podeAprovar(u, p.aprovador) && (admin || !meu);
  const podePagar = gestor && p.status === 'pronto';
  const podeDevolver = gestor && ['enviado', 'aprovacao', 'pronto'].includes(p.status) && (admin || !meu);
  const aberto = ['enviado', 'aprovacao', 'pronto', 'devolvido'].includes(p.status);
  const podeCancelar = aberto && (podeEditar(u, p) || gestor);

  const linha = (r: string, v?: string) => (v ? <View style={estilos.linha}><Text style={estilos.subtitulo}>{r}</Text><Text style={[estilos.valor, { flexShrink: 1, textAlign: 'right' }]}>{v}</Text></View> : null);
  const prazo = prazoDoPedido(p, hoje);

  if (pagando) {
    return <FormPagamento financeiro={financeiro} cad={cad} pedido={p} servicoFotos={servicoFotos} hoje={hoje} onVoltar={() => setPagando(false)} onPago={() => onMudou(`Pedido ${p.codigo} pago.`, true)} />;
  }

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Pressable testID="voltar-lista" onPress={onVoltar}><Text style={{ color: cores.primaria, fontWeight: '600' }}>‹ Pedidos</Text></Pressable>
      <Cartao>
        <Text style={estilos.titulo}>{p.codigo} · {NOME_TIPO_PEDIDO[p.tipo]}</Text>
        <Text testID="status-pedido" style={{ color: COR_STATUS[p.status], fontWeight: '700' }}>{NOME_STATUS_PEDIDO[p.status]}{p.urgente ? ' · URGENTE' : ''}</Text>
        {linha('Valor', reais(p.valor))}
        {linha('Descrição', p.descricao)}
        {linha('Recebe', p.favorecido)}
        {linha('Chave Pix', p.chavePix)}
        {linha('Boleto', p.boleto)}
        {linha('Reembolso de', p.reembolsoDe)}
        {linha('Vencimento', p.vencimento ? `${dataBR(p.vencimento)}${NOME_PRAZO[prazo] ? ` (${NOME_PRAZO[prazo].toLowerCase()})` : ''}` : undefined)}
        {linha('Centro de custo', nome(cad.centros, p.centroId))}
        {linha('Frente', p.frenteId ? nome(cad.frentes, p.frenteId) : undefined)}
        {linha('Tipo de despesa', p.tipoDespesaId ? nome(cad.tipos, p.tipoDespesaId) : undefined)}
        {linha('Nota fiscal', p.nota?.numero ? `Nº ${p.nota.numero}` : undefined)}
        {linha('Aprovação', p.aprovador === 'admin' ? 'Administrador' : p.aprovador === 'pagador' ? 'Pagador ou administrador' : 'Não precisa')}
        {p.pagamento && linha('Pago', `${reais(p.pagamento.valor)} em ${dataBR(p.pagamento.data)} · ${nome(cad.empresas, p.pagamento.empresaId)} / ${nome(cad.contas, p.pagamento.contaId)}`)}
        {linha('Obs. do pagamento', p.pagamento?.observacao)}
      </Cartao>

      {anexos.length > 0 && (
        <Cartao>
          <Text style={estilos.secao}>Arquivos</Text>
          {anexos.map((a) => <Text key={a.id} testID={`anexo-${a.id}`} style={estilos.subtitulo}>• {a.nome ?? (a.formato === 'xml' ? 'Nota (XML)' : a.formato === 'pdf' ? 'PDF' : 'Foto')}</Text>)}
        </Cartao>
      )}

      <Cartao>
        <Text style={estilos.secao}>Histórico</Text>
        {p.historico.map((h, i) => (
          <Text key={i} style={estilos.subtitulo}>{h.por.nome} {NOME_ACAO[h.acao]}{h.nota ? `: ${h.nota}` : ''}</Text>
        ))}
      </Cartao>

      {podeConferir && (
        <Cartao>
          <Text style={estilos.secao}>Conferir e classificar</Text>
          <Seletor testID="conf-centro" rotulo="Centro de custo" valor={centroId} opcoes={cad.centros.map((c) => ({ id: c.id, titulo: c.nome }))} onEscolher={(id) => { setCentroId(id); setFrenteId(id === p.centroId ? p.frenteId : null); }} />
          {frentes.length > 0 && <Seletor testID="conf-frente" rotulo="Frente de serviço" valor={frenteId ?? undefined} vazio="Nenhuma" opcoes={frentes.map((f) => ({ id: f.id, titulo: f.nome }))} onEscolher={setFrenteId} />}
          <Seletor testID="conf-tipo" rotulo="Tipo de despesa" valor={tipoDespesaId} vazio="Não definido" opcoes={cad.tipos.map((t) => ({ id: t.id, titulo: t.nome }))} onEscolher={setTipoDespesaId} />
          <Botao testID="conferir" titulo={p.aprovador === 'admin' && !admin ? 'Conferir e enviar para aprovação' : 'Conferir e liberar'}
            onPress={() => void agir(() => financeiro.pedidos.conferir(p.id, { centroId, frenteId, ...(tipoDespesaId ? { tipoDespesaId } : {}) }), 'Pedido conferido.')} />
        </Cartao>
      )}

      {podeLiberar && <Botao testID="aprovar" titulo="Aprovar" onPress={() => void agir(() => financeiro.pedidos.aprovar(p.id), 'Pedido aprovado.')} />}
      {podePagar && <Botao testID="pagar" titulo="Registrar pagamento" onPress={() => setPagando(true)} />}
      {p.status === 'devolvido' && meu && <Botao testID="corrigir" titulo="Corrigir e reenviar" onPress={onEditar} />}
      {p.status === 'enviado' && meu && <Botao testID="editar" secundario titulo="Editar" onPress={onEditar} />}

      {(podeDevolver || podeCancelar || (admin && aberto)) && (
        <Cartao>
          <Text style={estilos.secao}>Outras ações</Text>
          <Campo testID="motivo" rotulo="Motivo (devolução, rejeição ou cancelamento)" value={motivo} onChangeText={setMotivo} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {podeDevolver && <Botao testID="devolver" secundario titulo="Devolver" onPress={() => void agir(() => financeiro.pedidos.devolver(p.id, motivo), 'Pedido devolvido ao solicitante.')} />}
            {admin && aberto && <Botao testID="rejeitar" perigo titulo="Rejeitar" onPress={() => void agir(() => financeiro.pedidos.rejeitar(p.id, motivo), 'Pedido rejeitado.')} />}
            {podeCancelar && <Botao testID="cancelar" perigo titulo="Cancelar pedido" onPress={() => void agir(() => financeiro.pedidos.cancelar(p.id, motivo), 'Pedido cancelado.')} />}
          </View>
        </Cartao>
      )}
      {erro && <Text testID="erro" style={estilos.erro}>{erro}</Text>}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------

function FormPagamento({ financeiro, cad, pedido: p, servicoFotos, hoje, onVoltar, onPago }: {
  financeiro: Financeiro; cad: Cadastros; pedido: Pedido; servicoFotos: ServicoFotos; hoje: string; onVoltar: () => void; onPago: () => void;
}) {
  const empresaSugerida = cad.empresas.find((e) => e.cnpj && p.nota?.destinatario && soNumeros(e.cnpj) === soNumeros(p.nota.destinatario))?.id;
  const [empresaId, setEmpresaId] = useState(empresaSugerida);
  const [contaId, setContaId] = useState<string>();
  const [valor, setValor] = useState(String(p.valor).replace('.', ','));
  const [data, setData] = useState(formatarDataBR(hoje));
  const [obs, setObs] = useState('');
  const [comprovante, setComprovante] = useState<AnexoPendente>();
  const [erro, setErro] = useState<string>();

  const anexar = async () => {
    try {
      const d = servicoFotos.escolherDocumento ? await servicoFotos.escolherDocumento() : undefined;
      if (d) setComprovante({ uri: d.uri, formato: d.formato, nome: d.nome });
    } catch (e) { setErro(msgErro(e)); }
  };
  const registrar = async () => {
    setErro(undefined);
    try {
      const v = lerNumero(valor);
      if (v === undefined) throw new Error('Informe o valor pago');
      if (!empresaId || !contaId) throw new Error('Escolha a empresa e a conta que pagou');
      const dados: DadosPagamento = { data: analisarDataBR(data), empresaId, contaId, valor: v, ...(obs.trim() ? { observacao: obs } : {}) };
      await financeiro.pedidos.pagar(p.id, dados);
      if (comprovante) await financeiro.pedidos.anexarArquivo(p.id, comprovante);
      onPago();
    } catch (e) { setErro(msgErro(e) === 'Data inválida' ? 'Data do pagamento inválida (use dia/mês/ano)' : msgErro(e)); }
  };

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Pressable testID="voltar-pagamento" onPress={onVoltar}><Text style={{ color: cores.primaria, fontWeight: '600' }}>‹ Voltar</Text></Pressable>
      <Text style={estilos.titulo}>Pagar {p.codigo} · {p.favorecido}</Text>
      <Text style={estilos.subtitulo}>Pedido de {reais(p.valor)}</Text>
      <Cartao>
        <Seletor testID="pag-empresa" rotulo="Empresa que paga" valor={empresaId} opcoes={cad.empresas.map((e) => ({ id: e.id, titulo: e.apelido, subtitulo: e.nome }))} onEscolher={(id) => { setEmpresaId(id); setContaId(undefined); }} />
        {empresaId && <Seletor testID="pag-conta" rotulo="Conta" valor={contaId} opcoes={cad.contas.filter((c) => c.empresaId === empresaId).map((c) => ({ id: c.id, titulo: c.apelido, subtitulo: c.banco }))} onEscolher={setContaId} />}
        <Campo testID="pag-valor" rotulo="Valor pago (R$)" value={valor} onChangeText={setValor} keyboardType="decimal-pad" />
        <Campo testID="pag-data" rotulo="Data do pagamento" value={data} onChangeText={setData} />
        <Campo testID="pag-obs" rotulo="Observação (obrigatória se o valor mudou)" value={obs} onChangeText={setObs} />
        <Botao testID="anexar-comprovante" secundario titulo={comprovante ? `Comprovante: ${comprovante.nome ?? comprovante.formato}` : 'Anexar comprovante'} onPress={() => void anexar()} />
      </Cartao>
      {erro && <Text testID="erro" style={estilos.erro}>{erro}</Text>}
      <Botao testID="confirmar-pagamento" titulo="Confirmar pagamento" onPress={() => void registrar()} />
    </ScrollView>
  );
}
