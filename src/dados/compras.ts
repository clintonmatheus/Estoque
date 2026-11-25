import { dataLocal } from '../domain/datas';
import { podeConferirOuPagar } from '../domain/pedidos';
import { podeLancar, temFinanceiro, type Anexo, type Autoria, type Compra, type Fornecedor, type Usuario } from '../domain/tipos';
import type { Armazenamento, Tabela } from '../storage/contrato';
import type { OpcoesEstoque } from './estoque';

const texto = (s?: string) => (s?.trim() ? s.trim().replace(/\s+/g, ' ') : undefined);

export interface NovaCompra {
  fornecedorId: string;
  data?: string;
  descricao: string;
  valor: number;
  centroId: string;
  frenteId?: string;
  tipoDespesaId?: string;
  documento?: string;
}

/** Comprovante da compra (nota ou foto): obrigatório. */
export interface Comprovante { uri: string; formato: NonNullable<Anexo['formato']>; nome?: string }

/** Compras feitas a prazo em lojas de fatura semanal: ficam em aberto até o pagador fechar a fatura. */
export interface LojaEmAberto { fornecedor: Fornecedor; compras: Compra[]; total: number }

/** Quem lança compras a faturar: almoxarife, solicitante, pagador e administrador. Quem fecha a fatura: pagador e administrador. */
export class Compras {
  constructor(private a: Armazenamento, public readonly usuario: Usuario, private o: OpcoesEstoque) {}

  private autoria(): Autoria { return { id: this.usuario.id, nome: this.usuario.nome, em: this.o.agora() }; }
  private hoje() { return dataLocal(this.o.agora()); }
  private get gestor() { return podeConferirOuPagar(this.usuario); }
  private exigirAcesso() { if (!podeLancar(this.usuario) && !temFinanceiro(this.usuario)) throw new Error('Sem permissão para lançar compras'); }

  private async gravar<T extends { id: string }>(tabela: Tabela, doc: T): Promise<T> {
    await (this.a[tabela] as unknown as { salvar(d: T): Promise<void> }).salvar(doc);
    await this.a.fila.adicionar(tabela, doc.id);
    return doc;
  }

  /** Pagador e administrador veem todas; os demais, só as que lançaram. Da mais nova para a mais antiga. */
  async lista(): Promise<Compra[]> {
    this.exigirAcesso();
    const todas = await this.a.compras.listar();
    return todas.filter((c) => this.gestor || c.criado.id === this.usuario.id)
      .sort((x, y) => y.data.localeCompare(x.data) || y.criado.em.localeCompare(x.criado.em));
  }

  async anexos(compraId: string) { return (await this.a.anexos.listar()).filter((x) => x.grupo === compraId && !x.excluido); }

  /** Compras em aberto, por loja (quem fecha a fatura vê o total de cada uma). */
  async emAberto(): Promise<LojaEmAberto[]> {
    const abertas = (await this.lista()).filter((c) => c.status === 'aberta');
    const fornecedores = await this.a.fornecedores.listar();
    const porLoja = new Map<string, Compra[]>();
    for (const c of abertas) porLoja.set(c.fornecedorId, [...(porLoja.get(c.fornecedorId) ?? []), c]);
    return [...porLoja].flatMap(([id, compras]) => {
      const fornecedor = fornecedores.find((f) => f.id === id);
      if (!fornecedor) return [];
      const total = Math.round(compras.reduce((t, c) => t + c.valor, 0) * 100) / 100;
      return [{ fornecedor, compras, total }];
    }).sort((x, y) => x.fornecedor.nome.localeCompare(y.fornecedor.nome, 'pt-BR'));
  }

  async lancar(n: NovaCompra, comprovante: Comprovante | undefined): Promise<Compra> {
    this.exigirAcesso();
    const fornecedor = await this.a.fornecedores.obter(n.fornecedorId);
    if (!fornecedor) throw new Error('Escolha a loja');
    if (!fornecedor.ativo) throw new Error(`${fornecedor.nome} está inativo`);
    if (fornecedor.forma !== 'fatura') throw new Error(`${fornecedor.nome} não é loja de fatura semanal: peça o pagamento por um pedido`);
    const descricao = texto(n.descricao);
    if (!descricao) throw new Error('Descreva o que foi comprado');
    if (!(n.valor > 0) || !Number.isFinite(n.valor)) throw new Error('Informe o valor da compra');
    const centro = await this.a.centros.obter(n.centroId);
    if (!centro) throw new Error('Escolha o centro de custo');
    if (!centro.ativo) throw new Error(`${centro.nome} está parado: não recebe novas compras`);
    if (n.frenteId) {
      const f = await this.a.locais.obter(n.frenteId);
      if (!f || f.centroId !== n.centroId) throw new Error('A frente de serviço não pertence a esse centro de custo');
    }
    if (n.tipoDespesaId && !(await this.a.tipos_despesa.obter(n.tipoDespesaId))) throw new Error('Tipo de despesa não encontrado');
    const data = n.data ?? this.hoje();
    if (data > this.hoje()) throw new Error('A data da compra não pode ser futura');
    if (!comprovante) throw new Error('Anexe a nota ou a foto da compra: sem comprovante a compra não entra na fatura');
    const id = this.o.novoId();
    const compra: Compra = {
      id, fornecedorId: n.fornecedorId, data, descricao, valor: n.valor, centroId: n.centroId,
      ...(n.frenteId ? { frenteId: n.frenteId } : {}), ...(n.tipoDespesaId ? { tipoDespesaId: n.tipoDespesaId } : {}),
      ...(texto(n.documento) ? { documento: texto(n.documento) } : {}), status: 'aberta', criado: this.autoria(),
    };
    await this.gravar('compras', compra);
    await this.gravar<Anexo>('anexos', { id: this.o.novoId(), grupo: id, uri: comprovante.uri, formato: comprovante.formato, ...(comprovante.nome ? { nome: comprovante.nome } : {}), criado: this.autoria() });
    this.o.aoAlterar?.();
    return compra;
  }

  /** Quem lançou cancela a própria compra enquanto aberta; pagador e administrador cancelam qualquer compra aberta. */
  async cancelar(id: string): Promise<Compra> {
    this.exigirAcesso();
    const c = await this.a.compras.obter(id);
    if (!c) throw new Error('Compra não encontrada');
    if (c.status !== 'aberta') throw new Error(c.status === 'em_fatura' ? 'Esta compra já está numa fatura: cancele ou devolva o pedido da fatura' : 'Esta compra já foi cancelada');
    if (!this.gestor && c.criado.id !== this.usuario.id) throw new Error('Só dá para cancelar as compras que você lançou');
    const nova: Compra = { ...c, status: 'cancelada', alterado: this.autoria() };
    await this.gravar('compras', nova);
    this.o.aoAlterar?.();
    return nova;
  }
}
