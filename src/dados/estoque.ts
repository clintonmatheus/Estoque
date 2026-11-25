import { calcularPosicao, novosProblemas, type Posicao } from '../domain/estoque';
import { formatarQuantidade } from '../domain/formato';
import { ITENS_INICIAIS } from '../domain/itensIniciais';
import { mesmaPosse, posicoesDoBem, problemasDeBens, totalDoBem } from '../domain/bens';
import { cpfValido } from '../domain/nomes';
import { ehEpi, grupoDoFuncionario, podeLancar, type GrupoFuncionario, type Anexo, type Autoria, type Bem, type Funcionario, type Item, type Local, type Locacao, type Movimento, type MotivoSaidaBem, type MovimentoBem, type Posse, type TipoMovimento, type Usuario } from '../domain/tipos';
import { TABELAS, type Armazenamento, type Tabela } from '../storage/contrato';
import { criarArmazenamentoMemoria } from '../storage/memoria';

export interface OpcoesEstoque {
  agora: () => string;
  novoId: () => string;
  /** Chamado após cada alteração local (dispara a sincronização). */
  aoAlterar?: () => void;
}

export interface LinhaLancamento { itemId: string; quantidade: number; custoUnitario?: number; ca?: string; tamanho?: string; validade?: string }

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
  'data' | 'quantidade' | 'custoUnitario' | 'notaFiscal' | 'fornecedor' | 'localId' | 'localDestinoId' | 'funcionarioId' | 'observacao' | 'ca' | 'tamanho' | 'validade'>>;

export interface Contagem { itemId: string; contado: number }

type NovoItem = Omit<Item, 'id' | 'criado' | 'alterado'> & { id?: string };
type NovoLocal = Omit<Local, 'id' | 'criado' | 'alterado'> & { id?: string };
type NovoFuncionario = Omit<Funcionario, 'id' | 'criado' | 'alterado'> & { id?: string };
type NovoBem = Omit<Bem, 'id' | 'criado' | 'alterado'> & { id?: string };

export interface NovaMovimentacaoBem {
  bemId: string; data: string; quantidade: number; origem: Posse; destino: Posse;
  motivo?: MotivoSaidaBem; prevista?: string; observacao?: string;
}

const ehData = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

const porNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, 'pt-BR');
const texto = (s?: string) => (s?.trim() ? s.trim() : undefined);

/** Ponto único usado pelas telas: valida, grava no aparelho, registra autoria e enfileira o envio. */
export class Estoque {
  constructor(private a: Armazenamento, public readonly usuario: Usuario, private o: OpcoesEstoque) {}

  /** Cópia em memória com os mesmos dados, para testar uma importação sem gravar nada. */
  async copiaParaSimulacao(): Promise<Estoque> {
    const m = criarArmazenamentoMemoria();
    for (const t of TABELAS) {
      const destino = m[t] as { salvar(d: unknown): Promise<void> };
      for (const d of await this.a[t].listar()) await destino.salvar(d);
    }
    return new Estoque(m, this.usuario, { agora: this.o.agora, novoId: this.o.novoId });
  }

  private autoria(): Autoria { return { id: this.usuario.id, nome: this.usuario.nome, em: this.o.agora() }; }

  private exigirPermissao() { if (!podeLancar(this.usuario)) throw new Error('Sem permissão'); }

  private async gravar<T extends { id: string }>(tabela: Tabela, doc: T): Promise<T> {
    await (this.a[tabela] as unknown as { salvar(d: T): Promise<void> }).salvar(doc);
    await this.a.fila.adicionar(tabela, doc.id);
    return doc;
  }

  private alterou() { this.o.aoAlterar?.(); }

  // ---------- Leitura ----------
  /** `grupo`: só materiais do galpão ou só EPI (sem grupo: todos). */
  async itens(incluirInativos = false, grupo?: 'material' | 'epi') {
    return (await this.a.itens.listar())
      .filter((i) => (incluirInativos || i.ativo) && (!grupo || (grupo === 'epi') === ehEpi(i))).sort(porNome);
  }
  async locais(incluirInativos = false) {
    return (await this.a.locais.listar()).filter((l) => incluirInativos || l.ativo)
      .sort((x, y) => x.centroCusto.localeCompare(y.centroCusto, 'pt-BR') || porNome(x, y));
  }
  /** `grupo`: quem retira do galpão ou quem recebe EPI (sem grupo: todos). */
  async funcionarios(incluirInativos = false, grupo?: GrupoFuncionario) {
    return (await this.a.funcionarios.listar())
      .filter((f) => (incluirInativos || f.ativo) && (!grupo || grupoDoFuncionario(f) === grupo)).sort(porNome);
  }
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
    if (n.vidaUtilDias !== undefined && !(Number.isInteger(n.vidaUtilDias) && n.vidaUtilDias > 0)) throw new Error('Vida útil inválida: informe os dias até a troca');
    const atual = n.id ? await this.a.itens.obter(n.id) : undefined;
    if (atual && ehEpi(atual) !== ehEpi(n)) {
      const usado = (await this.a.movimentos.listar()).some((m) => m.itemId === atual.id);
      if (usado) throw new Error('Este item já tem lançamentos: não dá para passá-lo entre EPI e material');
    }
    const item: Item = {
      ...n, id: n.id ?? this.o.novoId(), nome, unidade: n.unidade.trim(),
      criado: atual?.criado ?? this.autoria(), ...(atual ? { alterado: this.autoria() } : {}),
    };
    if (!item.embalagem) delete item.embalagem;
    if (ehEpi(item)) {
      const tamanhos = [...new Set((item.tamanhos ?? []).map((t) => t.trim()).filter(Boolean))];
      if (tamanhos.length) item.tamanhos = tamanhos; else delete item.tamanhos;
      const ca = texto(item.ca); if (ca) item.ca = ca; else delete item.ca;
      if (item.vidaUtilDias === undefined) delete item.vidaUtilDias;
      if (!item.tipoTamanho) delete item.tipoTamanho;
    } else {
      delete item.ca; delete item.vidaUtilDias; delete item.tamanhos; delete item.tipoTamanho;
    }
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
    // Ligação com o centro de custo do financeiro: mantida enquanto o contrato não mudar.
    if (atual?.centroId && atual.centroCusto === centroCusto) local.centroId = atual.centroId;
    else delete local.centroId;
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
    const cpf = texto(n.cpf)?.replace(/\D/g, '');
    if (cpf) {
      if (!cpfValido(cpf)) throw new Error('CPF inválido');
      const igual = (await this.a.funcionarios.listar()).find((o) => o.id !== f.id && o.cpf === cpf && grupoDoFuncionario(o) === grupoDoFuncionario(f));
      if (igual) throw new Error(`Este CPF já está cadastrado para ${igual.nome}`);
      f.cpf = cpf;
    } else delete f.cpf;
    const funcao = texto(n.funcao); if (funcao) f.funcao = funcao; else delete f.funcao;
    const tamanhos = Object.fromEntries(Object.entries(n.tamanhos ?? {}).map(([k, v]) => [k, texto(v)]).filter(([, v]) => v));
    if (Object.keys(tamanhos).length) f.tamanhos = tamanhos; else delete f.tamanhos;
    if (f.grupo !== 'epi') delete f.grupo;
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

  // ---------- Ferramentas e equipamentos locados ----------
  private async descreverPosse(p: Posse): Promise<string> {
    if (p.tipo === 'galpao') return 'galpão';
    if (p.tipo === 'externo') return 'fora da empresa';
    const f = await this.a.funcionarios.obter(p.funcionarioId);
    const l = await this.a.locais.obter(p.localId);
    return `${f?.nome ?? '?'} (${l?.nome ?? '?'})`;
  }

  private async validarPosse(p: Posse) {
    if (p.tipo !== 'campo') return;
    const f = await this.a.funcionarios.obter(p.funcionarioId);
    if (!f) throw new Error('Funcionário não encontrado');
    const l = await this.a.locais.obter(p.localId);
    if (!l) throw new Error('Frente de serviço não encontrada');
  }

  private prepararBem(n: NovoBem, atual?: Bem): Bem {
    const nome = texto(n.nome)?.toUpperCase();
    if (!nome) throw new Error('Informe o nome');
    const b: Bem = { id: n.id ?? this.o.novoId(), nome, tipo: n.tipo, controle: n.controle, ativo: n.ativo, criado: atual?.criado ?? this.autoria() };
    if (atual) b.alterado = this.autoria();
    if (texto(n.codigo)) b.codigo = texto(n.codigo);
    if (texto(n.observacao)) b.observacao = texto(n.observacao);
    if (n.tipo === 'locado') {
      const l = n.locacao;
      const locadora = texto(l?.locadora);
      if (!l || !locadora) throw new Error('Informe a locadora');
      if (l.valor !== undefined && !(l.valor >= 0)) throw new Error('Valor inválido');
      for (const d of [l.inicio, l.prevista]) if (d !== undefined && !ehData(d)) throw new Error('Data inválida');
      if (l.inicio && l.prevista && l.prevista < l.inicio) throw new Error('O fim previsto não pode ser antes do início');
      const loc: Locacao = { locadora };
      if (texto(l.contrato)) loc.contrato = texto(l.contrato);
      if (l.valor !== undefined) { loc.valor = l.valor; loc.periodo = l.periodo ?? 'mes'; }
      if (l.inicio) loc.inicio = l.inicio;
      if (l.prevista) loc.prevista = l.prevista;
      if (l.localCobrancaId) loc.localCobrancaId = l.localCobrancaId;
      b.locacao = loc;
    }
    return b;
  }

  private async conferirDuplicado(b: Bem) {
    const igual = (await this.a.bens.listar()).find((x) => x.id !== b.id && x.nome === b.nome && (x.codigo ?? '') === (b.codigo ?? ''));
    if (igual) throw new Error('Já existe esse cadastro');
  }

  async salvarBem(n: NovoBem): Promise<Bem> {
    this.exigirPermissao();
    const atual = n.id ? await this.a.bens.obter(n.id) : undefined;
    const b = this.prepararBem(n, atual);
    await this.conferirDuplicado(b);
    if (atual && atual.controle !== b.controle && (await this.a.movimentos_bens.listar()).some((m) => m.bemId === b.id)) {
      throw new Error('Não é possível mudar o controle depois de movimentar');
    }
    await this.gravar('bens', b);
    this.alterou();
    return b;
  }

  /** Cadastra o bem e já registra onde ele está (levantamento geral). Nada é gravado se algo estiver errado. */
  async cadastrarBem(n: NovoBem, inicial: { posse: Posse; quantidade: number; data: string; prevista?: string }): Promise<Bem> {
    this.exigirPermissao();
    const b = this.prepararBem(n);
    await this.conferirDuplicado(b);
    const m = await this.prepararMovimentoBem(b, [], {
      bemId: b.id, data: inicial.data, quantidade: inicial.quantidade, origem: { tipo: 'externo' }, destino: inicial.posse,
      prevista: inicial.prevista, observacao: 'Levantamento inicial',
    });
    await this.gravar('bens', b);
    await this.gravar('movimentos_bens', m);
    this.alterou();
    return b;
  }

  async bens(incluirInativos = false) {
    return (await this.a.bens.listar()).filter((b) => incluirInativos || b.ativo)
      .sort((x, y) => porNome(x, y) || (x.codigo ?? '').localeCompare(y.codigo ?? '', 'pt-BR', { numeric: true }));
  }
  async movimentosBens() { return this.a.movimentos_bens.listar(); }

  private async conferirSaldoBens(antes: MovimentoBem[], depois: MovimentoBem[], bem: Bem) {
    const ja = problemasDeBens(antes);
    const novo = [...problemasDeBens(depois)].find((id) => !ja.has(id));
    if (!novo) return;
    const m = depois.find((x) => x.id === novo)!;
    const porBem = posicoesDoBem(depois.filter((x) => x.id !== novo), bem.id).find((p) => mesmaPosse(p.posse, m.origem));
    throw new Error(`Saldo insuficiente: ${bem.nome}${bem.codigo ? ` ${bem.codigo}` : ''} — ${await this.descreverPosse(m.origem)} tem ${porBem?.quantidade ?? 0}`);
  }

  private async prepararMovimentoBem(bem: Bem, existentes: MovimentoBem[], n: NovaMovimentacaoBem): Promise<MovimentoBem> {
    if (!bem.ativo) throw new Error('Cadastro inativo');
    if (!ehData(n.data)) throw new Error('Data inválida');
    if (!(Number.isInteger(n.quantidade) && n.quantidade > 0)) throw new Error('Informe a quantidade');
    if (bem.controle === 'unidade' && n.quantidade !== 1) throw new Error('Ferramenta individual: a quantidade é sempre 1');
    if (mesmaPosse(n.origem, n.destino)) throw new Error('Origem e destino são iguais');
    await this.validarPosse(n.origem);
    await this.validarPosse(n.destino);
    if (n.destino.tipo === 'externo') {
      if (!n.motivo) throw new Error('Informe o motivo da saída');
      if (n.motivo === 'devolucao-locadora' && bem.tipo !== 'locado') throw new Error('Só equipamento locado volta para a locadora');
    }
    if (n.prevista !== undefined && !ehData(n.prevista)) throw new Error('Data inválida');
    if (n.prevista && n.prevista < n.data) throw new Error('A devolução prevista não pode ser antes da saída');
    if (n.origem.tipo === 'externo' && bem.controle === 'unidade' && totalDoBem(existentes, bem.id) > 0) {
      throw new Error(`${bem.nome}${bem.codigo ? ` ${bem.codigo}` : ''} já está cadastrada`);
    }
    const m: MovimentoBem = { id: this.o.novoId(), bemId: bem.id, data: n.data, quantidade: n.quantidade, origem: n.origem, destino: n.destino, criado: this.autoria() };
    if (n.destino.tipo === 'externo') m.motivo = n.motivo;
    if (n.prevista && n.destino.tipo === 'campo') m.prevista = n.prevista;
    if (texto(n.observacao)) m.observacao = texto(n.observacao);
    await this.conferirSaldoBens(existentes, [...existentes, m], bem);
    return m;
  }

  async movimentarBem(n: NovaMovimentacaoBem): Promise<MovimentoBem> {
    this.exigirPermissao();
    const bem = await this.a.bens.obter(n.bemId);
    if (!bem) throw new Error('Cadastro não encontrado');
    const m = await this.prepararMovimentoBem(bem, await this.a.movimentos_bens.listar(), n);
    await this.gravar('movimentos_bens', m);
    this.alterou();
    return m;
  }

  private async movimentoBem(id: string) {
    const m = await this.a.movimentos_bens.obter(id);
    if (!m) throw new Error('Lançamento não encontrado');
    if (m.cancelado) throw new Error('Lançamento cancelado');
    return m;
  }

  async editarMovimentoBem(id: string, campos: { observacao?: string; prevista?: string }): Promise<MovimentoBem> {
    this.exigirPermissao();
    const m = { ...(await this.movimentoBem(id)), alterado: this.autoria() };
    if ('observacao' in campos) { const v = texto(campos.observacao); if (v) m.observacao = v; else delete m.observacao; }
    if ('prevista' in campos) {
      if (campos.prevista && !ehData(campos.prevista)) throw new Error('Data inválida');
      if (campos.prevista && campos.prevista < m.data) throw new Error('A devolução prevista não pode ser antes da saída');
      if (campos.prevista) m.prevista = campos.prevista; else delete m.prevista;
    }
    await this.gravar('movimentos_bens', m);
    this.alterou();
    return m;
  }

  async cancelarMovimentoBem(id: string, motivo: string): Promise<MovimentoBem> {
    this.exigirPermissao();
    if (!texto(motivo)) throw new Error('Informe o motivo do cancelamento');
    const m = await this.movimentoBem(id);
    const todos = await this.a.movimentos_bens.listar();
    const novo: MovimentoBem = { ...m, cancelado: { ...this.autoria(), motivo: motivo.trim() } };
    const bem = await this.a.bens.obter(m.bemId);
    if (bem) await this.conferirSaldoBens(todos, todos.map((x) => (x.id === id ? novo : x)), bem);
    await this.gravar('movimentos_bens', novo);
    this.alterou();
    return novo;
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

  private validarCampos(m: Pick<Movimento, 'tipo' | 'data' | 'quantidade' | 'custoUnitario' | 'localId' | 'localDestinoId' | 'funcionarioId' | 'validade'>) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.data)) throw new Error('Data inválida');
    if (m.tipo === 'ajuste' ? m.quantidade === 0 : !(m.quantidade > 0)) throw new Error('Quantidade inválida');
    if (m.tipo === 'entrada' && m.custoUnitario !== undefined && !(m.custoUnitario >= 0)) throw new Error('Valor unitário inválido');
    if (['saida', 'devolucao', 'transferencia'].includes(m.tipo) && !m.localId) {
      throw new Error(m.tipo === 'saida' ? 'Informe a frente de serviço de destino' : 'Informe a frente de serviço de origem');
    }
    if (m.tipo === 'transferencia') {
      if (!m.localDestinoId) throw new Error('Informe a frente de serviço de destino');
      if (m.localDestinoId === m.localId) throw new Error('Origem e destino devem ser diferentes');
    }
    if (m.tipo === 'saida' && !m.funcionarioId) throw new Error('Informe quem retirou');
    if (m.tipo === 'epi' && !m.funcionarioId) throw new Error('Informe o funcionário');
    if (m.validade !== undefined && !ehData(m.validade)) throw new Error('Data de validade inválida');
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
        m.custoUnitario = ln.custoUnitario ?? 0; // sem valor: material antigo, só catalogado
        if (texto(l.notaFiscal)) m.notaFiscal = texto(l.notaFiscal);
        if (texto(l.fornecedor)) m.fornecedor = texto(l.fornecedor);
      }
      if (l.tipo !== 'entrada' && l.localId) m.localId = l.localId;
      if (l.tipo === 'transferencia' && l.localDestinoId) m.localDestinoId = l.localDestinoId;
      if (l.funcionarioId && l.tipo !== 'entrada') m.funcionarioId = l.funcionarioId;
      if (texto(l.observacao)) m.observacao = texto(l.observacao);
      if (l.tipo === 'epi') {
        if (texto(ln.ca)) m.ca = texto(ln.ca);
        if (texto(ln.tamanho)) m.tamanho = texto(ln.tamanho);
        if (texto(ln.validade)) m.validade = texto(ln.validade);
      }
      this.validarCampos(m);
      return m;
    });
    await this.validarGrupos(l.tipo, novos);
    const antes = await this.a.movimentos.listar();
    await this.validarSaldo(antes, [...antes, ...novos]);
    for (const m of novos) await this.gravar('movimentos', m);
    this.alterou();
    return novos;
  }

  /** EPI e material são grupos separados: EPI só vai a funcionário de EPI e retirada só de funcionário do galpão. */
  private async validarGrupos(tipo: TipoMovimento, movs: Movimento[]) {
    for (const m of movs) {
      const item = await this.a.itens.obter(m.itemId);
      if (!item) throw new Error('Item não encontrado');
      if (tipo === 'epi' && !ehEpi(item)) throw new Error(`${item.nome} não é um item de EPI`);
      if (['saida', 'devolucao', 'transferencia'].includes(tipo) && ehEpi(item)) throw new Error(`${item.nome} é EPI: lance pela aba EPI`);
      if (m.funcionarioId && (tipo === 'epi' || tipo === 'saida' || tipo === 'devolucao')) {
        const f = await this.a.funcionarios.obter(m.funcionarioId);
        if (!f) throw new Error('Funcionário não encontrado');
        if (tipo === 'epi' && grupoDoFuncionario(f) !== 'epi') throw new Error(`${f.nome} não está cadastrado como funcionário de EPI`);
        if (tipo !== 'epi' && grupoDoFuncionario(f) === 'epi') throw new Error(`${f.nome} é funcionário de EPI: não retira material do galpão`);
      }
    }
  }

  /**
   * Passa para o grupo de EPI quem já recebeu EPI e nunca retirou material nem ficou com ferramenta
   * (só se ainda não tem grupo). Seguro rodar de novo.
   */
  async migrarFuncionariosEpi(): Promise<number> {
    this.exigirPermissao();
    const movs = await this.a.movimentos.listar();
    const bens = await this.a.movimentos_bens.listar();
    const comEpi = new Set(movs.filter((m) => m.tipo === 'epi' && m.funcionarioId).map((m) => m.funcionarioId!));
    const comOutro = new Set(movs.filter((m) => m.tipo !== 'epi' && m.funcionarioId).map((m) => m.funcionarioId!));
    for (const b of bens) for (const p of [b.origem, b.destino]) if (p.tipo === 'campo') comOutro.add(p.funcionarioId);
    let n = 0;
    for (const f of await this.a.funcionarios.listar()) {
      if (f.grupo || !comEpi.has(f.id) || comOutro.has(f.id)) continue;
      await this.gravar('funcionarios', { ...f, grupo: 'epi', alterado: this.autoria() });
      n += 1;
    }
    if (n) this.alterou();
    return n;
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
    for (const k of ['notaFiscal', 'fornecedor', 'observacao', 'ca', 'tamanho', 'validade'] as const) {
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
