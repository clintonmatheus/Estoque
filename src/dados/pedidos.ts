import { dataLocal } from '../domain/datas';
import { lerBoleto } from '../domain/boleto';
import { lerChavePix } from '../domain/nomes';
import { aprovadorExigido, ehAberto, podeAprovar, podeConferirOuPagar, podeEditar, possiveisDuplicados } from '../domain/pedidos';
import {
  ehAdminFinanceiro, NOME_STATUS_PEDIDO, podePagar, temFinanceiro, type AcaoPedido, type Anexo, type Autoria, type Compra, type NotaTerceiro, type Pedido, type PagamentoPedido, type StatusPedido, type TipoPedido, type Usuario,
} from '../domain/tipos';
import type { Armazenamento, Tabela } from '../storage/contrato';
import type { OpcoesEstoque } from './estoque';

const texto = (s?: string) => (s?.trim() ? s.trim().replace(/\s+/g, ' ') : undefined);

export interface NovoPedido {
  id?: string;
  tipo: TipoPedido;
  descricao: string;
  valor: number;
  /** Obrigatório, exceto na fatura semanal (o custo vem das compras). */
  centroId?: string;
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
  /** Fatura semanal: ids das compras que este pedido paga (sem centro de custo próprio: cada compra tem o seu). */
  fatura?: { compras: string[]; justificativa?: string };
  /** Pagamento a terceirizado: as notas fiscais chegam depois do pagamento (só pagador e administrador abrem). */
  terceirizado?: boolean;
}

/** O que a conferência pode corrigir (a classificação); valor e tipo voltam ao solicitante pela devolução. */
export interface AjustesConferencia { centroId?: string; frenteId?: string | null; tipoDespesaId?: string; fornecedorId?: string; descricao?: string }

export interface NovaNota { numero: string; valor: number; emissao?: string; arquivo?: { uri: string; formato: NonNullable<Anexo['formato']>; nome?: string } }

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
    if (!n.fatura) {
      const centro = n.centroId ? await this.a.centros.obter(n.centroId) : undefined;
      if (!centro) throw new Error('Escolha o centro de custo');
      if (!centro.ativo) throw new Error(`${centro.nome} está parado: não recebe novos pedidos`);
      if (n.frenteId) {
        const f = await this.a.locais.obter(n.frenteId);
        if (!f || f.centroId !== n.centroId) throw new Error('A frente de serviço não pertence a esse centro de custo');
      }
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
    if (n.terceirizado) {
      if (!podeConferirOuPagar(this.usuario)) throw new Error('Sem permissão: só o pagador ou o administrador abre pagamento a terceirizado');
      if (n.fatura) throw new Error('Pagamento a terceirizado não é fatura de loja');
      if (n.tipo === 'reembolso') throw new Error('Pagamento a terceirizado é por Pix ou boleto');
    }
    const id = n.id ?? this.o.novoId();
    const fatura = n.fatura ? await this.resolverFatura(n, id) : undefined;
    if (fatura) { const { centroId: _c, frenteId: _f, tipoDespesaId: _t, ...resto } = n; n = resto; }
    const dados = await this.validar(n);
    const agora = this.o.agora();
    const base: Omit<Pedido, 'historico' | 'status' | 'criado'> = {
      id, codigo: atual?.codigo ?? this.codigo(id, agora), tipo: n.tipo, valor: n.valor,
      ...(n.centroId ? { centroId: n.centroId } : {}), ...(n.frenteId ? { frenteId: n.frenteId } : {}), ...(n.tipoDespesaId ? { tipoDespesaId: n.tipoDespesaId } : {}),
      ...(n.fornecedorId ? { fornecedorId: n.fornecedorId } : {}), ...dados,
      ...(n.urgente ? { urgente: true } : {}), ...(n.nota && Object.keys(n.nota).length ? { nota: n.nota } : {}),
      ...(texto(n.reembolsoDe) ? { reembolsoDe: texto(n.reembolsoDe) } : {}),
      ...(fatura ? { fatura: fatura.dados } : {}),
      ...(n.terceirizado ? { terceirizado: { notas: atual?.terceirizado?.notas ?? [] } } : {}),
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
    return { compras: ids, dados: { compras: ids, soma, ...(justificativa ? { justificativa } : {}) } };
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
    if (p.fatura) {
      // Fatura: o custo está nas compras; a conferência só valida e libera.
      const eventosF: { acao: AcaoPedido }[] = [{ acao: 'conferiu' }];
      if (p.aprovador === 'nenhum') return this.mudar(p, 'pronto', eventosF);
      if (podeAprovar(this.usuario, p.aprovador)) return this.mudar(p, 'pronto', [...eventosF, { acao: 'aprovou' }]);
      return this.mudar(p, 'aprovacao', eventosF);
    }
    const centroId = ajustes.centroId ?? p.centroId;
    if (!centroId || !(await this.a.centros.obter(centroId))) throw new Error('Centro de custo não encontrado');
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
    if (!podePagar(this.usuario)) throw new Error('Sem permissão: só o pagador (ou o administrador marcado para pagar) registra o pagamento');
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

  // ---------- Terceirizado: notas fiscais que chegam depois do pagamento ----------
  private exigirTerceirizadoPago(p: Pedido) {
    this.exigirPagadorOuAdmin();
    if (!p.terceirizado) throw new Error('Este pedido não é de terceirizado');
    if (p.status !== 'pago') throw new Error('As notas são lançadas depois que o pagamento é registrado');
  }

  /** Fecha sozinho quando as notas somam o valor pago; reabre se uma nota sai e a soma deixa de bater (encerramento justificado não reabre). */
  private ajustarEncerramento(p: Pedido, notas: NotaTerceiro[]): { terceirizado: Pedido['terceirizado']; fechou: boolean; reabriu: boolean } {
    const soma = Math.round(notas.reduce((t, n) => t + n.valor, 0) * 100);
    const pago = Math.round((p.pagamento?.valor ?? 0) * 100);
    const atual = p.terceirizado!.encerrada;
    if (soma === pago && !atual) return { terceirizado: { notas, encerrada: { por: this.autoria() } }, fechou: true, reabriu: false };
    if (soma !== pago && atual && !atual.justificativa) return { terceirizado: { notas }, fechou: false, reabriu: true };
    return { terceirizado: { notas, ...(atual ? { encerrada: atual } : {}) }, fechou: false, reabriu: false };
  }

  /** Lança uma nota recebida (com o arquivo, se houver). Quando as notas somam o valor pago, o pedido é encerrado sozinho. */
  async lancarNota(pedidoId: string, n: NovaNota): Promise<Pedido> {
    const p = await this.carregar(pedidoId);
    this.exigirTerceirizadoPago(p);
    if (p.terceirizado!.encerrada) throw new Error('As notas deste pagamento já foram encerradas');
    const numero = texto(n.numero);
    if (!numero) throw new Error('Informe o número da nota');
    if (!(n.valor > 0) || !Number.isFinite(n.valor)) throw new Error('Informe o valor da nota');
    if (p.terceirizado!.notas.some((x) => x.numero.toLowerCase() === numero.toLowerCase())) throw new Error(`A nota ${numero} já foi lançada neste pagamento`);
    const outro = (await this.a.pedidos.listar()).find((x) => x.id !== p.id && x.terceirizado?.notas.some((y) => y.numero.toLowerCase() === numero.toLowerCase() && y.valor === n.valor && x.favorecido === p.favorecido));
    if (outro) throw new Error(`A nota ${numero} deste favorecido já foi lançada no pedido ${outro.codigo}`);
    const id = this.o.novoId();
    let anexoId: string | undefined;
    if (n.arquivo) {
      const x = await this.gravar<Anexo>('anexos', { id: this.o.novoId(), grupo: p.id, uri: n.arquivo.uri, formato: n.arquivo.formato, nome: n.arquivo.nome ?? `NF ${numero}`, criado: this.autoria() });
      anexoId = x.id;
    }
    const nota: NotaTerceiro = { id, numero, valor: Math.round(n.valor * 100) / 100, ...(n.emissao ? { emissao: n.emissao } : {}), ...(anexoId ? { anexoId } : {}), criado: this.autoria() };
    const r = this.ajustarEncerramento(p, [...p.terceirizado!.notas, nota]);
    const eventos: { acao: AcaoPedido; nota?: string }[] = [{ acao: 'lancou_nota', nota: `NF ${numero}` }];
    if (r.fechou) eventos.push({ acao: 'encerrou_notas', nota: 'notas somam o valor pago' });
    return this.mudar(p, p.status, eventos, { terceirizado: r.terceirizado });
  }

  /** Remove uma nota lançada por engano (e o arquivo dela). Se o pedido tinha fechado sozinho, volta a ficar pendente. */
  async removerNota(pedidoId: string, notaId: string): Promise<Pedido> {
    const p = await this.carregar(pedidoId);
    this.exigirTerceirizadoPago(p);
    const nota = p.terceirizado!.notas.find((x) => x.id === notaId);
    if (!nota) throw new Error('Nota não encontrada');
    if (nota.anexoId) { const x = await this.a.anexos.obter(nota.anexoId); if (x) await this.gravar('anexos', { ...x, excluido: true }); }
    const r = this.ajustarEncerramento(p, p.terceirizado!.notas.filter((x) => x.id !== notaId));
    return this.mudar(p, p.status, [{ acao: 'removeu_nota', nota: `NF ${nota.numero}` }], { terceirizado: r.terceirizado });
  }

  /** Encerra o acompanhamento quando as notas não fecham o valor pago; exige explicar a diferença. */
  async encerrarNotas(pedidoId: string, justificativa: string): Promise<Pedido> {
    const p = await this.carregar(pedidoId);
    this.exigirTerceirizadoPago(p);
    if (p.terceirizado!.encerrada) throw new Error('As notas deste pagamento já foram encerradas');
    const j = texto(justificativa);
    if (!j) throw new Error('Explique a diferença entre as notas e o valor pago');
    return this.mudar(p, p.status, [{ acao: 'encerrou_notas', nota: j }], { terceirizado: { notas: p.terceirizado!.notas, encerrada: { por: this.autoria(), justificativa: j } } });
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
