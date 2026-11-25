import { dataLocal } from '../domain/datas';
import { lerBoleto } from '../domain/boleto';
import { lerChavePix } from '../domain/nomes';
import { aprovadorExigido, ehAberto, podeAprovar, podeConferirOuPagar, podeEditar, possiveisDuplicados } from '../domain/pedidos';
import {
  ehAdminFinanceiro, NOME_STATUS_PEDIDO, temFinanceiro, type AcaoPedido, type Anexo, type Autoria, type Compra, type Pedido, type PagamentoPedido, type StatusPedido, type TipoPedido, type Usuario,
} from '../domain/tipos';
import type { Armazenamento, Tabela } from '../storage/contrato';
import type { OpcoesEstoque } from './estoque';

const texto = (s?: string) => (s?.trim() ? s.trim().replace(/\s+/g, ' ') : undefined);

export interface NovoPedido {
  id?: string;
  tipo: TipoPedido;
  descricao: string;
  valor: number;
  centroId: string;
  frenteId?: string;
  tipoDespesaId?: string;
  fornecedorId?: string;
  favorecido?: string;
  chavePix?: string;
  /** Linha digitável ou código de barras. */
  boleto?: string;
  vencimento?: string;
  urgente?: boolean;
  nota?: Pedido['nota'];
  reembolsoDe?: string;
  /** Fatura semanal: ids das compras que este pedido paga (o centro de custo vem da maior compra). */
  fatura?: { compras: string[]; justificativa?: string };
}

/** O que a conferência pode corrigir (a classificação); valor e tipo voltam ao solicitante pela devolução. */
export interface AjustesConferencia { centroId?: string; frenteId?: string | null; tipoDespesaId?: string; fornecedorId?: string; descricao?: string }

export interface DadosPagamento { data: string; empresaId: string; contaId: string; valor: number; observacao?: string }

/** Pedidos de pagamento: solicitar, conferir, aprovar, pagar (cada passo fica no histórico do pedido). */
export class Pedidos {
  constructor(private a: Armazenamento, public readonly usuario: Usuario, private o: OpcoesEstoque) {}

  private autoria(): Autoria { return { id: this.usuario.id, nome: this.usuario.nome, em: this.o.agora() }; }
  private hoje() { return dataLocal(this.o.agora()); }

  private async gravar<T extends { id: string }>(tabela: Tabela, doc: T): Promise<T> {
    await (this.a[tabela] as unknown as { salvar(d: T): Promise<void> }).salvar(doc);
    await this.a.fila.adicionar(tabela, doc.id);
    return doc;
  }

  private exigirFinanceiro() { if (!temFinanceiro(this.usuario)) throw new Error('Sem permissão: você não usa o financeiro'); }
  private exigirPagadorOuAdmin() { if (!podeConferirOuPagar(this.usuario)) throw new Error('Sem permissão: só o pagador ou o administrador do financeiro faz isto'); }
  private get admin() { return ehAdminFinanceiro(this.usuario); }
  private get abriuPagador() { return this.usuario.financeiro === 'pagador'; }

  // ---------- Leitura ----------
  /** Solicitante vê só os seus; pagador e administrador veem todos. Do mais novo para o mais antigo. */
  async lista(): Promise<Pedido[]> {
    this.exigirFinanceiro();
    const todos = await this.a.pedidos.listar();
    return todos.filter((p) => podeConferirOuPagar(this.usuario) || p.criado.id === this.usuario.id).sort((x, y) => y.criado.em.localeCompare(x.criado.em));
  }

  async obter(id: string) { return (await this.lista()).find((p) => p.id === id); }

  async anexos(pedidoId: string) { return (await this.a.anexos.listar()).filter((x) => x.grupo === pedidoId && !x.excluido); }

  // ---------- Solicitar ----------
  private codigo(id: string, agora: string): string {
    const d = dataLocal(agora);
    const fim = id.replace(/[^a-z0-9]/gi, '').slice(-3).toUpperCase().padStart(3, '0');
    return `P-${d.slice(8, 10)}${d.slice(5, 7)}-${fim}`;
  }

  private async validar(n: NovoPedido): Promise<Pick<Pedido, 'descricao' | 'chavePix' | 'boleto' | 'vencimento' | 'favorecido'>> {
    const descricao = texto(n.descricao);
    if (!descricao) throw new Error('Descreva o pagamento');
    if (!(n.valor > 0) || !Number.isFinite(n.valor)) throw new Error('Informe o valor do pedido');
    const centro = (await this.a.centros.obter(n.centroId));
    if (!centro) throw new Error('Escolha o centro de custo');
    if (!centro.ativo) throw new Error(`${centro.nome} está parado: não recebe novos pedidos`);
    if (n.frenteId) {
      const f = await this.a.locais.obter(n.frenteId);
      if (!f || f.centroId !== n.centroId) throw new Error('A frente de serviço não pertence a esse centro de custo');
    }
    if (n.tipoDespesaId && !(await this.a.tipos_despesa.obter(n.tipoDespesaId))) throw new Error('Tipo de despesa não encontrado');
    const fornecedor = n.fornecedorId ? await this.a.fornecedores.obter(n.fornecedorId) : undefined;
    if (n.fornecedorId && !fornecedor) throw new Error('Fornecedor não encontrado');
    const favorecido = texto(n.favorecido) ?? fornecedor?.nome;
    if (!favorecido) throw new Error('Informe quem vai receber (fornecedor ou nome)');
    const saida: Pick<Pedido, 'descricao' | 'chavePix' | 'boleto' | 'vencimento' | 'favorecido'> = { descricao, favorecido };
    if (n.tipo === 'pix' || n.tipo === 'reembolso') {
      const chave = texto(n.chavePix) ?? fornecedor?.chavePix;
      if (!chave) throw new Error('Informe a chave Pix');
      saida.chavePix = lerChavePix(chave).chave;
      if (n.tipo === 'reembolso' && !texto(n.reembolsoDe)) throw new Error('Informe quem gastou o dinheiro (para reembolsar)');
      if (n.vencimento) saida.vencimento = n.vencimento;
    } else {
      if (!texto(n.boleto)) throw new Error('Informe a linha digitável ou o código de barras do boleto');
      const b = lerBoleto(n.boleto!, this.hoje());
      if (b.valor !== undefined && Math.abs(b.valor - n.valor) > 0.005) {
        throw new Error(`O valor do pedido (R$ ${n.valor.toFixed(2).replace('.', ',')}) é diferente do valor do boleto (R$ ${b.valor.toFixed(2).replace('.', ',')})`);
      }
      const vencimento = b.vencimento ?? n.vencimento;
      if (!vencimento) throw new Error('Informe o vencimento do boleto');
      saida.boleto = b.codigoBarras;
      saida.vencimento = vencimento;
    }
    return saida;
  }

  /** Abre ou corrige (só o dono, antes da conferência) um pedido. Pedido parecido com outro exige `confirmarDuplicado`. */
  async solicitar(n: NovoPedido, opcoes: { confirmarDuplicado?: boolean } = {}): Promise<Pedido> {
    this.exigirFinanceiro();
    const atual = n.id ? await this.a.pedidos.obter(n.id) : undefined;
    if (atual && !podeEditar(this.usuario, atual)) throw new Error('Este pedido já foi conferido ou não é seu: não dá para editar');
    const id = n.id ?? this.o.novoId();
    const fatura = n.fatura ? await this.resolverFatura(n, id) : undefined;
    if (fatura) n = { ...n, centroId: fatura.centroId, frenteId: undefined, tipoDespesaId: n.tipoDespesaId };
    const dados = await this.validar(n);
    const agora = this.o.agora();
    const base: Omit<Pedido, 'historico' | 'status' | 'criado'> = {
      id, codigo: atual?.codigo ?? this.codigo(id, agora), tipo: n.tipo, valor: n.valor,
      centroId: n.centroId, ...(n.frenteId ? { frenteId: n.frenteId } : {}), ...(n.tipoDespesaId ? { tipoDespesaId: n.tipoDespesaId } : {}),
      ...(n.fornecedorId ? { fornecedorId: n.fornecedorId } : {}), ...dados,
      ...(n.urgente ? { urgente: true } : {}), ...(n.nota && Object.keys(n.nota).length ? { nota: n.nota } : {}),
      ...(texto(n.reembolsoDe) ? { reembolsoDe: texto(n.reembolsoDe) } : {}),
      ...(fatura ? { fatura: fatura.dados } : {}),
      aprovador: aprovadorExigido({ tipo: n.tipo, valor: n.valor }, this.abriuPagador),
    };
    const outros = await this.a.pedidos.listar();
    const { exatos, parecidos } = possiveisDuplicados({ ...base }, outros);
    if (exatos.length) throw new Error(`Este pagamento já foi pedido (${exatos[0].codigo}, ${NOME_STATUS_PEDIDO[exatos[0].status].toLowerCase()})`);
    if (parecidos.length && !opcoes.confirmarDuplicado) {
      throw new Error(`DUPLICADO: parece o pedido ${parecidos[0].codigo} (${NOME_STATUS_PEDIDO[parecidos[0].status].toLowerCase()}): mesmo favorecido, valor e data`);
    }
    const acao: AcaoPedido = !atual ? 'enviou' : atual.status === 'devolvido' ? 'reenviou' : 'editou';
    const pedido: Pedido = {
      ...base, status: 'enviado',
      criado: atual?.criado ?? this.autoria(), ...(atual ? { alterado: this.autoria() } : {}),
      historico: [...(atual?.historico ?? []), { acao, por: this.autoria() }],
    };
    await this.gravar('pedidos', pedido);
    if (fatura) await this.prenderCompras(fatura.compras, id);
    this.o.aoAlterar?.();
    return pedido;
  }

  /** Confere as compras da fatura: mesma loja, em aberto (ou já deste pedido), soma e justificativa da diferença. */
  private async resolverFatura(n: NovoPedido, id: string) {
    if (!podeConferirOuPagar(this.usuario)) throw new Error('Sem permissão: só o pagador ou o administrador fecha uma fatura');
    if (n.tipo === 'reembolso') throw new Error('Fatura de loja é paga por boleto ou Pix');
    if (!n.fornecedorId) throw new Error('Escolha a loja da fatura');
    const ids = [...new Set(n.fatura!.compras)];
    if (!ids.length) throw new Error('Escolha ao menos uma compra para a fatura');
    const compras: Compra[] = [];
    for (const cid of ids) {
      const c = await this.a.compras.obter(cid);
      if (!c) throw new Error('Compra não encontrada');
      if (c.fornecedorId !== n.fornecedorId) throw new Error('Todas as compras da fatura precisam ser da mesma loja');
      if (c.status === 'cancelada' || (c.status === 'em_fatura' && c.pedidoId !== id)) throw new Error('Uma das compras já está em outra fatura ou foi cancelada');
      compras.push(c);
    }
    const soma = Math.round(compras.reduce((t, c) => t + c.valor, 0) * 100) / 100;
    const justificativa = texto(n.fatura!.justificativa);
    if (Math.abs(soma - n.valor) > 0.005 && !justificativa) {
      throw new Error(`O valor da fatura (R$ ${n.valor.toFixed(2).replace('.', ',')}) é diferente da soma das compras (R$ ${soma.toFixed(2).replace('.', ',')}): explique a diferença`);
    }
    const porCentro = new Map<string, number>();
    for (const c of compras) porCentro.set(c.centroId, (porCentro.get(c.centroId) ?? 0) + c.valor);
    const centroId = [...porCentro].sort((a, b) => b[1] - a[1])[0][0];
    return { centroId, compras: ids, dados: { compras: ids, soma, ...(justificativa ? { justificativa } : {}) } };
  }

  private async prenderCompras(ids: string[], pedidoId: string) {
    const agora = this.autoria();
    for (const cid of ids) {
      const c = await this.a.compras.obter(cid);
      if (c && (c.status !== 'em_fatura' || c.pedidoId !== pedidoId)) await this.gravar('compras', { ...c, status: 'em_fatura' as const, pedidoId, alterado: agora });
    }
  }

  /** Pedido cancelado ou rejeitado: as compras voltam a aguardar uma nova fatura. */
  private async soltarCompras(p: Pedido) {
    for (const cid of p.fatura?.compras ?? []) {
      const c = await this.a.compras.obter(cid);
      if (c && c.pedidoId === p.id && c.status === 'em_fatura') {
        const { pedidoId: _x, ...resto } = c;
        await this.gravar('compras', { ...resto, status: 'aberta' as const, alterado: this.autoria() });
      }
    }
  }

  // ---------- Passos do fluxo ----------
  private async carregar(id: string): Promise<Pedido> {
    const p = await this.a.pedidos.obter(id);
    if (!p) throw new Error('Pedido não encontrado');
    return p;
  }

  private async mudar(p: Pedido, status: StatusPedido, eventos: { acao: AcaoPedido; nota?: string }[], extra: Partial<Pedido> = {}): Promise<Pedido> {
    const novo: Pedido = { ...p, ...extra, status, alterado: this.autoria(), historico: [...p.historico, ...eventos.map((e) => ({ ...e, por: this.autoria() }))] };
    await this.gravar('pedidos', novo);
    if (status === 'cancelado' || status === 'rejeitado') await this.soltarCompras(novo);
    this.o.aoAlterar?.();
    return novo;
  }

  /** O pagador não confere, devolve nem libera o pedido que ele mesmo abriu (isso é do administrador). */
  private naoEhMeuPedidoDePagador(p: Pedido) {
    if (!this.admin && p.criado.id === this.usuario.id) throw new Error('O pedido que você abriu precisa ser conferido e aprovado por um administrador');
  }

  /**
   * Confere os dados com os documentos (e corrige a classificação). Quem confere e também pode aprovar libera na hora;
   * senão o pedido vai para a fila de aprovação.
   */
  async conferir(id: string, ajustes: AjustesConferencia = {}): Promise<Pedido> {
    this.exigirPagadorOuAdmin();
    const p = await this.carregar(id);
    if (p.status !== 'enviado') throw new Error('Só se confere pedido que está aguardando conferência');
    this.naoEhMeuPedidoDePagador(p);
    const centroId = ajustes.centroId ?? p.centroId;
    if (!(await this.a.centros.obter(centroId))) throw new Error('Centro de custo não encontrado');
    const frenteId = ajustes.frenteId === null ? undefined : ajustes.frenteId ?? (centroId === p.centroId ? p.frenteId : undefined);
    if (frenteId && (await this.a.locais.obter(frenteId))?.centroId !== centroId) throw new Error('A frente de serviço não pertence a esse centro de custo');
    const tipoDespesaId = ajustes.tipoDespesaId ?? p.tipoDespesaId;
    if (tipoDespesaId && !(await this.a.tipos_despesa.obter(tipoDespesaId))) throw new Error('Tipo de despesa não encontrado');
    if (ajustes.fornecedorId && !(await this.a.fornecedores.obter(ajustes.fornecedorId))) throw new Error('Fornecedor não encontrado');
    const corrigido: Pedido = { ...p, centroId, descricao: texto(ajustes.descricao) ?? p.descricao, ...(ajustes.fornecedorId ? { fornecedorId: ajustes.fornecedorId } : {}) };
    if (frenteId) corrigido.frenteId = frenteId; else delete corrigido.frenteId;
    if (tipoDespesaId) corrigido.tipoDespesaId = tipoDespesaId; else delete corrigido.tipoDespesaId;
    const eventos: { acao: AcaoPedido }[] = [{ acao: 'conferiu' }];
    if (p.aprovador === 'nenhum') return this.mudar(corrigido, 'pronto', eventos);
    if (podeAprovar(this.usuario, p.aprovador)) return this.mudar(corrigido, 'pronto', [...eventos, { acao: 'aprovou' }]);
    return this.mudar(corrigido, 'aprovacao', eventos);
  }

  async aprovar(id: string, nota?: string): Promise<Pedido> {
    const p = await this.carregar(id);
    if (p.status !== 'aprovacao') throw new Error('Este pedido não está aguardando aprovação');
    if (!podeAprovar(this.usuario, p.aprovador)) throw new Error(p.aprovador === 'admin' ? 'Só um administrador aprova este pedido' : 'Sem permissão para aprovar');
    return this.mudar(p, 'pronto', [{ acao: 'aprovou', nota: texto(nota) }]);
  }

  async devolver(id: string, motivo: string): Promise<Pedido> {
    this.exigirPagadorOuAdmin();
    const p = await this.carregar(id);
    if (!['enviado', 'aprovacao', 'pronto'].includes(p.status)) throw new Error('Este pedido não pode ser devolvido');
    this.naoEhMeuPedidoDePagador(p);
    const m = texto(motivo);
    if (!m) throw new Error('Diga o que precisa ser corrigido');
    if (p.aprovador === 'admin' && !this.admin && p.status !== 'enviado') throw new Error('Só um administrador devolve um pedido já conferido');
    return this.mudar(p, 'devolvido', [{ acao: 'devolveu', nota: m }]);
  }

  async rejeitar(id: string, motivo: string): Promise<Pedido> {
    if (!this.admin) throw new Error('Sem permissão: só o administrador rejeita um pedido');
    const p = await this.carregar(id);
    if (!['enviado', 'aprovacao', 'pronto', 'devolvido'].includes(p.status)) throw new Error('Este pedido não pode ser rejeitado');
    const m = texto(motivo);
    if (!m) throw new Error('Informe o motivo da rejeição');
    return this.mudar(p, 'rejeitado', [{ acao: 'rejeitou', nota: m }]);
  }

  /** O solicitante cancela o próprio pedido até a conferência; pagador e administrador cancelam até o pagamento (com motivo). */
  async cancelar(id: string, motivo?: string): Promise<Pedido> {
    this.exigirFinanceiro();
    const p = await this.carregar(id);
    if (!ehAberto(p)) throw new Error('Este pedido não pode mais ser cancelado');
    const m = texto(motivo);
    if (podeEditar(this.usuario, p)) return this.mudar(p, 'cancelado', [{ acao: 'cancelou', nota: m }]);
    if (!podeConferirOuPagar(this.usuario)) throw new Error('Só dá para cancelar o seu pedido antes da conferência');
    if (!m) throw new Error('Informe o motivo do cancelamento');
    return this.mudar(p, 'cancelado', [{ acao: 'cancelou', nota: m }]);
  }

  async pagar(id: string, d: DadosPagamento): Promise<Pedido> {
    this.exigirPagadorOuAdmin();
    const p = await this.carregar(id);
    if (p.status !== 'pronto') throw new Error('Só se paga pedido pronto para pagar');
    const conta = await this.a.contas.obter(d.contaId);
    if (!conta || conta.empresaId !== d.empresaId) throw new Error('Escolha a empresa e uma conta dela');
    if (!(d.valor > 0)) throw new Error('Informe o valor pago');
    const obs = texto(d.observacao);
    if (Math.abs(d.valor - p.valor) > 0.005 && !obs) throw new Error('O valor pago é diferente do pedido: explique (juros, multa ou desconto)');
    if (d.data > this.hoje()) throw new Error('A data do pagamento não pode ser futura');
    const pagamento: PagamentoPedido = { data: d.data, empresaId: d.empresaId, contaId: d.contaId, valor: d.valor, ...(obs ? { observacao: obs } : {}) };
    return this.mudar(p, 'pago', [{ acao: 'pagou', nota: obs }], { pagamento });
  }

  // ---------- Arquivos do pedido ----------
  async anexarArquivo(pedidoId: string, a: { uri: string; formato: NonNullable<Anexo['formato']>; nome?: string }): Promise<Anexo> {
    this.exigirFinanceiro();
    const p = await this.carregar(pedidoId);
    const dono = podeEditar(this.usuario, p);
    if (!dono && !podeConferirOuPagar(this.usuario)) throw new Error('Sem permissão para anexar neste pedido');
    const x = await this.gravar<Anexo>('anexos', { id: this.o.novoId(), grupo: pedidoId, uri: a.uri, formato: a.formato, ...(a.nome ? { nome: a.nome } : {}), criado: this.autoria() });
    this.o.aoAlterar?.();
    return x;
  }

  async removerAnexo(id: string): Promise<void> {
    this.exigirFinanceiro();
    const x = await this.a.anexos.obter(id);
    if (!x) return;
    const p = await this.carregar(x.grupo);
    if (!podeEditar(this.usuario, p) && !podeConferirOuPagar(this.usuario)) throw new Error('Sem permissão para remover este arquivo');
    await this.gravar('anexos', { ...x, excluido: true });
    this.o.aoAlterar?.();
  }
}
