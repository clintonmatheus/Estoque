import { calcularPosicao, novosProblemas, type Posicao } from '../domain/estoque';
import { formatarQuantidade } from '../domain/formato';
import { ITENS_INICIAIS } from '../domain/itensIniciais';
import { podeLancar, type Anexo, type Autoria, type Funcionario, type Item, type Local, type Movimento, type TipoMovimento, type Usuario } from '../domain/tipos';
import type { Armazenamento, Tabela } from '../storage/contrato';

export interface OpcoesEstoque {
  agora: () => string;
  novoId: () => string;
  /** Chamado após cada alteração local (dispara a sincronização). */
  aoAlterar?: () => void;
}

export interface LinhaLancamento { itemId: string; quantidade: number; custoUnitario?: number }

export interface Lancamento {
  tipo: Exclude<TipoMovimento, 'ajuste'>;
  data: string;
  notaFiscal?: string;
  fornecedor?: string;
  localId?: string;
  localDestinoId?: string;
  funcionarioId?: string;
  observacao?: string;
  linhas: LinhaLancamento[];
}

export type CamposEditaveis = Partial<Pick<Movimento,
  'data' | 'quantidade' | 'custoUnitario' | 'notaFiscal' | 'fornecedor' | 'localId' | 'localDestinoId' | 'funcionarioId' | 'observacao'>>;

export interface Contagem { itemId: string; contado: number }

type NovoItem = Omit<Item, 'id' | 'criado' | 'alterado'> & { id?: string };
type NovoLocal = Omit<Local, 'id' | 'criado' | 'alterado'> & { id?: string };
type NovoFuncionario = Omit<Funcionario, 'id' | 'criado' | 'alterado'> & { id?: string };

const porNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, 'pt-BR');
const texto = (s?: string) => (s?.trim() ? s.trim() : undefined);

/** Ponto único usado pelas telas: valida, grava no aparelho, registra autoria e enfileira o envio. */
export class Estoque {
  constructor(private a: Armazenamento, public readonly usuario: Usuario, private o: OpcoesEstoque) {}

  private autoria(): Autoria { return { id: this.usuario.id, nome: this.usuario.nome, em: this.o.agora() }; }

  private exigirPermissao() { if (!podeLancar(this.usuario)) throw new Error('Sem permissão'); }

  private async gravar<T extends { id: string }>(tabela: Tabela, doc: T): Promise<T> {
    await (this.a[tabela] as unknown as { salvar(d: T): Promise<void> }).salvar(doc);
    await this.a.fila.adicionar(tabela, doc.id);
    return doc;
  }

  private alterou() { this.o.aoAlterar?.(); }

  // ---------- Leitura ----------
  async itens(incluirInativos = false) { return (await this.a.itens.listar()).filter((i) => incluirInativos || i.ativo).sort(porNome); }
  async locais(incluirInativos = false) {
    return (await this.a.locais.listar()).filter((l) => incluirInativos || l.ativo)
      .sort((x, y) => x.centroCusto.localeCompare(y.centroCusto, 'pt-BR') || porNome(x, y));
  }
  async funcionarios(incluirInativos = false) { return (await this.a.funcionarios.listar()).filter((f) => incluirInativos || f.ativo).sort(porNome); }
  async movimentos() { return this.a.movimentos.listar(); }
  async anexos(grupo: string) { return (await this.a.anexos.listar()).filter((x) => x.grupo === grupo && !x.excluido); }

  private async custosReferencia() {
    return Object.fromEntries((await this.a.itens.listar()).map((i) => [i.id, i.custoReferencia]));
  }

  async posicao(): Promise<Posicao> { return calcularPosicao(await this.a.movimentos.listar(), await this.custosReferencia()); }

  // ---------- Cadastros ----------
  async salvarItem(n: NovoItem): Promise<Item> {
    this.exigirPermissao();
    const nome = texto(n.nome)?.toUpperCase();
    if (!nome) throw new Error('Informe o nome do item');
    if (!texto(n.unidade)) throw new Error('Informe a unidade');
    if (n.embalagem && !(n.embalagem.fator > 1 && texto(n.embalagem.nome))) throw new Error('Embalagem inválida');
    if (!(n.estoqueMinimo >= 0)) throw new Error('Estoque mínimo inválido');
    const repetido = (await this.a.itens.listar()).find((i) => i.id !== n.id && i.nome === nome);
    if (repetido) throw new Error('Já existe um item com esse nome');
    const atual = n.id ? await this.a.itens.obter(n.id) : undefined;
    const item: Item = {
      ...n, id: n.id ?? this.o.novoId(), nome, unidade: n.unidade.trim(),
      criado: atual?.criado ?? this.autoria(), ...(atual ? { alterado: this.autoria() } : {}),
    };
    if (!item.embalagem) delete item.embalagem;
    await this.gravar('itens', item);
    this.alterou();
    return item;
  }

  async salvarLocal(n: NovoLocal): Promise<Local> {
    this.exigirPermissao();
    const nome = texto(n.nome);
    const centroCusto = texto(n.centroCusto);
    if (!nome) throw new Error('Informe a frente de serviço');
    if (!centroCusto) throw new Error('Informe o centro de custo (contrato)');
    const atual = n.id ? await this.a.locais.obter(n.id) : undefined;
    const local: Local = {
      ...n, id: n.id ?? this.o.novoId(), nome, centroCusto,
      criado: atual?.criado ?? this.autoria(), ...(atual ? { alterado: this.autoria() } : {}),
    };
    await this.gravar('locais', local);
    this.alterou();
    return local;
  }

  async salvarFuncionario(n: NovoFuncionario): Promise<Funcionario> {
    this.exigirPermissao();
    const nome = texto(n.nome);
    if (!nome) throw new Error('Informe o nome');
    const atual = n.id ? await this.a.funcionarios.obter(n.id) : undefined;
    const f: Funcionario = {
      ...n, id: n.id ?? this.o.novoId(), nome,
      criado: atual?.criado ?? this.autoria(), ...(atual ? { alterado: this.autoria() } : {}),
    };
    await this.gravar('funcionarios', f);
    this.alterou();
    return f;
  }

  /** Cadastra a lista da planilha do galpão (só os itens que ainda não existem). */
  async importarItensIniciais(): Promise<number> {
    this.exigirPermissao();
    const existentes = new Set((await this.a.itens.listar()).flatMap((i) => [i.id, i.nome]));
    let n = 0;
    for (const base of ITENS_INICIAIS) {
      if (existentes.has(base.id) || existentes.has(base.nome)) continue;
      await this.gravar('itens', { ...base, estoqueMinimo: 0, ativo: true, criado: this.autoria() } as Item);
      n += 1;
    }
    if (n) this.alterou();
    return n;
  }

  // ---------- Movimentos ----------
  private async validarSaldo(antes: Movimento[], depois: Movimento[]) {
    const problemas = novosProblemas(antes, depois, await this.custosReferencia());
    if (!problemas.length) return;
    const p = problemas[0];
    const item = await this.a.itens.obter(p.itemId);
    const nome = item?.nome ?? 'item';
    const qtd = item ? formatarQuantidade(item, p.disponivel) : String(p.disponivel);
    if (p.localId) {
      const local = await this.a.locais.obter(p.localId);
      throw new Error(`Quantidade maior que a entregue: ${nome} — ${local?.nome ?? 'a frente'} tem ${qtd}`);
    }
    throw new Error(`Saldo insuficiente: ${nome} — disponível ${qtd}`);
  }

  private validarCampos(m: Pick<Movimento, 'tipo' | 'data' | 'quantidade' | 'custoUnitario' | 'localId' | 'localDestinoId' | 'funcionarioId'>) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.data)) throw new Error('Data inválida');
    if (m.tipo === 'ajuste' ? m.quantidade === 0 : !(m.quantidade > 0)) throw new Error('Quantidade inválida');
    if (m.tipo === 'entrada' && !(m.custoUnitario !== undefined && m.custoUnitario >= 0)) throw new Error('Informe o valor unitário');
    if (['saida', 'devolucao', 'transferencia'].includes(m.tipo) && !m.localId) {
      throw new Error(m.tipo === 'saida' ? 'Informe a frente de serviço de destino' : 'Informe a frente de serviço de origem');
    }
    if (m.tipo === 'transferencia') {
      if (!m.localDestinoId) throw new Error('Informe a frente de serviço de destino');
      if (m.localDestinoId === m.localId) throw new Error('Origem e destino devem ser diferentes');
    }
    if (m.tipo === 'saida' && !m.funcionarioId) throw new Error('Informe quem retirou');
  }

  async lancar(l: Lancamento): Promise<Movimento[]> {
    this.exigirPermissao();
    if (!l.linhas.length) throw new Error('Inclua pelo menos um item');
    const grupo = this.o.novoId();
    const criado = this.autoria();
    const novos: Movimento[] = l.linhas.map((ln) => {
      const m: Movimento = {
        id: this.o.novoId(), grupo, tipo: l.tipo, data: l.data, itemId: ln.itemId, quantidade: ln.quantidade, criado,
      };
      if (l.tipo === 'entrada') {
        m.custoUnitario = ln.custoUnitario;
        if (texto(l.notaFiscal)) m.notaFiscal = texto(l.notaFiscal);
        if (texto(l.fornecedor)) m.fornecedor = texto(l.fornecedor);
      }
      if (l.tipo !== 'entrada' && l.localId) m.localId = l.localId;
      if (l.tipo === 'transferencia' && l.localDestinoId) m.localDestinoId = l.localDestinoId;
      if (l.funcionarioId && l.tipo !== 'entrada') m.funcionarioId = l.funcionarioId;
      if (texto(l.observacao)) m.observacao = texto(l.observacao);
      this.validarCampos(m);
      return m;
    });
    const antes = await this.a.movimentos.listar();
    await this.validarSaldo(antes, [...antes, ...novos]);
    for (const m of novos) await this.gravar('movimentos', m);
    this.alterou();
    return novos;
  }

  private async substituir(atualizado: Movimento): Promise<Movimento> {
    const antes = await this.a.movimentos.listar();
    await this.validarSaldo(antes, antes.map((m) => (m.id === atualizado.id ? atualizado : m)));
    await this.gravar('movimentos', atualizado);
    this.alterou();
    return atualizado;
  }

  private async movimento(id: string) {
    const m = await this.a.movimentos.obter(id);
    if (!m) throw new Error('Lançamento não encontrado');
    if (m.cancelado) throw new Error('Lançamento cancelado');
    return m;
  }

  async editarMovimento(id: string, campos: CamposEditaveis): Promise<Movimento> {
    this.exigirPermissao();
    const m = { ...(await this.movimento(id)), ...campos, alterado: this.autoria() };
    for (const k of ['notaFiscal', 'fornecedor', 'observacao'] as const) {
      if (k in campos) { const v = texto(campos[k]); if (v) m[k] = v; else delete m[k]; }
    }
    this.validarCampos(m);
    return this.substituir(m);
  }

  /** Altera campos comuns (data, nota, frente, quem retirou…) em todas as linhas ativas do lançamento. */
  async editarGrupo(grupo: string, campos: Omit<CamposEditaveis, 'quantidade' | 'custoUnitario'>): Promise<Movimento[]> {
    this.exigirPermissao();
    const antes = await this.a.movimentos.listar();
    const alterado = this.autoria();
    const novos = antes.filter((m) => m.grupo === grupo && !m.cancelado).map((m) => {
      const n: Movimento = { ...m, ...campos, alterado };
      for (const k of ['notaFiscal', 'fornecedor', 'observacao'] as const) {
        if (k in campos) { const v = texto(campos[k]); if (v) n[k] = v; else delete n[k]; }
      }
      this.validarCampos(n);
      return n;
    });
    if (!novos.length) throw new Error('Lançamento não encontrado');
    const porId = new Map(novos.map((m) => [m.id, m]));
    await this.validarSaldo(antes, antes.map((m) => porId.get(m.id) ?? m));
    for (const m of novos) await this.gravar('movimentos', m);
    this.alterou();
    return novos;
  }

  async cancelarMovimento(id: string, motivo: string): Promise<Movimento> {
    this.exigirPermissao();
    if (!texto(motivo)) throw new Error('Informe o motivo do cancelamento');
    const m = await this.movimento(id);
    return this.substituir({ ...m, cancelado: { ...this.autoria(), motivo: motivo.trim() } });
  }

  /** Gera ajustes para as diferenças entre o contado e o saldo do aparelho. */
  async registrarInventario(data: string, contagens: Contagem[]): Promise<Movimento[]> {
    this.exigirPermissao();
    const pos = await this.posicao();
    const grupo = this.o.novoId();
    const criado = this.autoria();
    const ajustes: Movimento[] = [];
    for (const c of contagens) {
      if (!(c.contado >= 0)) throw new Error('Quantidade contada inválida');
      const diferenca = Math.round((c.contado - (pos.itens[c.itemId]?.quantidade ?? 0)) * 1000) / 1000;
      if (diferenca === 0) continue;
      ajustes.push({ id: this.o.novoId(), grupo, tipo: 'ajuste', data, itemId: c.itemId, quantidade: diferenca, observacao: 'Inventário', criado });
    }
    if (!ajustes.length) return [];
    const antes = await this.a.movimentos.listar();
    await this.validarSaldo(antes, [...antes, ...ajustes]);
    for (const m of ajustes) await this.gravar('movimentos', m);
    this.alterou();
    return ajustes;
  }

  async anexarFoto(grupo: string, uri: string): Promise<Anexo> {
    this.exigirPermissao();
    const x = await this.gravar<Anexo>('anexos', { id: this.o.novoId(), grupo, uri, criado: this.autoria() });
    this.alterou();
    return x;
  }

  async removerAnexo(id: string): Promise<void> {
    this.exigirPermissao();
    const x = await this.a.anexos.obter(id);
    if (!x) return;
    await this.gravar('anexos', { ...x, excluido: true });
    this.alterou();
  }
}
