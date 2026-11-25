import { ehMes } from '../domain/meses';
import { chaveNome, documentoValido, ENCARGOS_INICIAIS, juntarApelidos, lerChavePix, TIPOS_DESPESA_INICIAIS } from '../domain/nomes';
import {
  ehAdminFinanceiro, type Autoria, type CentroCusto, type ContaBancaria, type CustoFixo, type Empresa, type Encargo, type Fornecedor, type Local, type TipoDespesa, type Usuario,
} from '../domain/tipos';
import { TABELAS, type Armazenamento, type Tabela } from '../storage/contrato';
import { criarArmazenamentoMemoria } from '../storage/memoria';
import type { OpcoesEstoque } from './estoque';
import { Pedidos } from './pedidos';

type Novo<T> = Omit<T, 'id' | 'criado' | 'alterado'> & { id?: string };
export type NovaEmpresa = Novo<Empresa>;
export type NovaConta = Omit<Novo<ContaBancaria>, 'apelido'> & { apelido?: string };
export type NovoCentro = Omit<Novo<CentroCusto>, 'apelidos'> & { apelidos?: string[] };
export type NovoFornecedor = Omit<Novo<Fornecedor>, 'apelidos'> & { apelidos?: string[] };
export type NovoTipo = Omit<Novo<TipoDespesa>, 'apelidos'> & { apelidos?: string[] };
export type NovoCustoFixo = Omit<CustoFixo, 'id'> & { id?: string };
/** Primeiro mês de vigência dos encargos iniciais (valem para todo o histórico). */
export const DESDE_SEMPRE = '2000-01';

export interface NovaFrente { id?: string; nome: string; centroId: string; ativo: boolean }

/** Frentes do estoque cujo contrato ainda não está ligado a um centro de custo do financeiro. */
export interface FrentesSemCentro { texto: string; frentes: Local[] }

const texto = (s?: string) => (s?.trim() ? s.trim().replace(/\s+/g, ' ') : undefined);
const porNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome, 'pt-BR');
const ativos = <T extends { ativo: boolean }>(l: T[], todos: boolean) => l.filter((x) => todos || x.ativo);

/** Contas iniciais informadas: ALN no BB e no Inter; Passos no BB, Itaú, Inter e Nubank. */
const EMPRESAS_INICIAIS = [
  { apelido: 'ALN', nome: 'A. L. N. Serviços e Construções Ltda.', bancos: ['Banco do Brasil', 'Inter'] },
  { apelido: 'Passos', nome: 'Construtora Passos', bancos: ['Banco do Brasil', 'Itaú', 'Inter', 'Nubank'] },
];
const SIGLA_BANCO: Record<string, string> = { 'Banco do Brasil': 'BB' };

/** Cadastros do financeiro: valida, grava no aparelho, registra autoria e enfileira o envio (como o Estoque). */
export class Financeiro {
  constructor(private a: Armazenamento, public readonly usuario: Usuario, private o: OpcoesEstoque) {}

  async copiaParaSimulacao(): Promise<Financeiro> {
    const m = criarArmazenamentoMemoria();
    for (const t of TABELAS) {
      const destino = m[t] as { salvar(d: unknown): Promise<void> };
      for (const d of await this.a[t].listar()) await destino.salvar(d);
    }
    return new Financeiro(m, this.usuario, { agora: this.o.agora, novoId: this.o.novoId });
  }

  get podeEditar() { return ehAdminFinanceiro(this.usuario); }

  /** Pedidos de pagamento (usa os mesmos cadastros e o mesmo armazenamento). */
  get pedidos() { return new Pedidos(this.a, this.usuario, this.o); }

  private autoria(): Autoria { return { id: this.usuario.id, nome: this.usuario.nome, em: this.o.agora() }; }
  private exigirAdmin() { if (!this.podeEditar) throw new Error('Sem permissão: só o administrador do financeiro altera cadastros'); }

  private async gravar<T extends { id: string }>(tabela: Tabela, doc: T): Promise<T> {
    await (this.a[tabela] as unknown as { salvar(d: T): Promise<void> }).salvar(doc);
    await this.a.fila.adicionar(tabela, doc.id);
    return doc;
  }

  private carimbo<T extends { criado: Autoria }>(atual: T | undefined) {
    return { criado: atual?.criado ?? this.autoria(), ...(atual ? { alterado: this.autoria() } : {}) };
  }

  // ---------- Leitura ----------
  async empresas(todos = false) { return ativos(await this.a.empresas.listar(), todos).sort((x, y) => x.apelido.localeCompare(y.apelido, 'pt-BR')); }
  async contas(todos = false) { return ativos(await this.a.contas.listar(), todos).sort((x, y) => x.apelido.localeCompare(y.apelido, 'pt-BR')); }
  async centros(todos = false) { return ativos(await this.a.centros.listar(), todos).sort(porNome); }
  async fornecedores(todos = false) { return ativos(await this.a.fornecedores.listar(), todos).sort(porNome); }
  async tipos(todos = false) { return ativos(await this.a.tipos_despesa.listar(), todos).sort(porNome); }
  async encargos(todos = false) { return ativos(await this.a.encargos.listar(), todos).sort(porNome); }
  /** Frentes de serviço (as mesmas do estoque). */
  async frentes(todos = false) { return ativos(await this.a.locais.listar(), todos).sort(porNome); }

  async frentesSemCentro(): Promise<FrentesSemCentro[]> {
    const grupos = new Map<string, Local[]>();
    for (const l of await this.a.locais.listar()) {
      if (l.centroId || !l.ativo) continue;
      grupos.set(l.centroCusto, [...(grupos.get(l.centroCusto) ?? []), l]);
    }
    return [...grupos].map(([t, frentes]) => ({ texto: t, frentes: frentes.sort(porNome) })).sort((x, y) => x.texto.localeCompare(y.texto, 'pt-BR'));
  }

  // ---------- Cadastros ----------
  async salvarEmpresa(n: NovaEmpresa): Promise<Empresa> {
    this.exigirAdmin();
    const apelido = texto(n.apelido);
    const nome = texto(n.nome);
    if (!apelido) throw new Error('Informe o nome curto da empresa (ex.: ALN)');
    if (!nome) throw new Error('Informe a razão social');
    const lista = await this.a.empresas.listar();
    if (lista.some((e) => e.id !== n.id && chaveNome(e.apelido) === chaveNome(apelido))) throw new Error(`Já existe a empresa ${apelido}`);
    const atual = n.id ? await this.a.empresas.obter(n.id) : undefined;
    const e: Empresa = { ...n, id: n.id ?? this.o.novoId(), apelido, nome, ...this.carimbo(atual) };
    if (texto(n.cnpj)) e.cnpj = documentoValido(n.cnpj!); else delete e.cnpj;
    await this.gravar('empresas', e);
    this.o.aoAlterar?.();
    return e;
  }

  private async empresaAtiva(id: string) {
    const e = await this.a.empresas.obter(id);
    if (!e) throw new Error('Escolha a empresa');
    return e;
  }

  async salvarConta(n: NovaConta): Promise<ContaBancaria> {
    this.exigirAdmin();
    const empresa = await this.empresaAtiva(n.empresaId);
    const banco = texto(n.banco);
    if (!banco) throw new Error('Informe o banco');
    const apelido = texto(n.apelido) ?? `${SIGLA_BANCO[banco] ?? banco} ${empresa.apelido}`;
    if ((await this.a.contas.listar()).some((c) => c.id !== n.id && chaveNome(c.apelido) === chaveNome(apelido))) throw new Error(`Já existe a conta ${apelido}`);
    const atual = n.id ? await this.a.contas.obter(n.id) : undefined;
    const c: ContaBancaria = { ...n, id: n.id ?? this.o.novoId(), banco, apelido, ...this.carimbo(atual) };
    for (const k of ['agencia', 'numero'] as const) { if (texto(n[k])) c[k] = texto(n[k]); else delete c[k]; }
    await this.gravar('contas', c);
    this.o.aoAlterar?.();
    return c;
  }

  /** Nome ou outro nome já usado por outro cadastro da lista. */
  private conflito<T extends { id: string; nome: string; apelidos?: string[] }>(lista: T[], id: string | undefined, nomes: string[]) {
    const chaves = new Set(nomes.map(chaveNome));
    return lista.find((x) => x.id !== id && [x.nome, ...(x.apelidos ?? [])].some((k) => chaves.has(chaveNome(k))));
  }

  async salvarCentro(n: NovoCentro): Promise<CentroCusto> {
    this.exigirAdmin();
    const nome = texto(n.nome);
    if (!nome) throw new Error('Informe o nome do centro de custo');
    if (n.empresaId) await this.empresaAtiva(n.empresaId);
    const apelidos = juntarApelidos(nome, n.apelidos);
    const lista = await this.a.centros.listar();
    const outro = this.conflito(lista, n.id, [nome, ...apelidos]);
    if (outro) throw new Error(`Esse nome já é usado pelo centro de custo ${outro.nome}`);
    const mesmoTipo = n.especial && lista.find((c) => c.id !== n.id && c.especial === n.especial);
    if (mesmoTipo) throw new Error(`Já existe o centro ${mesmoTipo.nome}: a ${n.especial === 'administracao' ? 'administração' : 'estoque do galpão'} é um só para as duas empresas`);
    const atual = n.id ? await this.a.centros.obter(n.id) : undefined;
    const c: CentroCusto = { ...n, id: n.id ?? this.o.novoId(), nome, apelidos, ...this.carimbo(atual) };
    if (!c.especial) delete c.especial;
    if (!c.empresaId) delete c.empresaId;
    await this.gravar('centros', c);
    // O estoque mostra o nome do contrato em cada frente: acompanha a mudança de nome.
    if (atual && atual.nome !== nome) {
      for (const l of await this.a.locais.listar()) if (l.centroId === c.id) await this.gravar('locais', { ...l, centroCusto: nome, alterado: this.autoria() });
    }
    this.o.aoAlterar?.();
    return c;
  }

  async salvarFrente(n: NovaFrente): Promise<Local> {
    this.exigirAdmin();
    const nome = texto(n.nome);
    if (!nome) throw new Error('Informe a frente de serviço');
    const centro = await this.a.centros.obter(n.centroId);
    if (!centro) throw new Error('Escolha o centro de custo');
    const repetida = (await this.a.locais.listar()).find((l) => l.id !== n.id && l.centroId === centro.id && chaveNome(l.nome) === chaveNome(nome));
    if (repetida) throw new Error(`Já existe a frente ${repetida.nome} em ${centro.nome}`);
    const atual = n.id ? await this.a.locais.obter(n.id) : undefined;
    const l: Local = { ...(atual ?? {}), id: n.id ?? this.o.novoId(), nome, centroId: centro.id, centroCusto: centro.nome, ativo: n.ativo, ...this.carimbo(atual) };
    await this.gravar('locais', l);
    this.o.aoAlterar?.();
    return l;
  }

  /** Liga ao centro de custo todas as frentes do estoque cadastradas com esse contrato (texto). */
  async vincularFrentes(textoContrato: string, centroId: string): Promise<number> {
    this.exigirAdmin();
    const centro = await this.a.centros.obter(centroId);
    if (!centro) throw new Error('Escolha o centro de custo');
    let n = 0;
    for (const l of await this.a.locais.listar()) {
      if (l.centroId || l.centroCusto !== textoContrato) continue;
      await this.gravar('locais', { ...l, centroId: centro.id, centroCusto: centro.nome, alterado: this.autoria() });
      n++;
    }
    // O nome antigo do contrato vira outro nome do centro (as planilhas antigas usam esse nome).
    if (n && chaveNome(textoContrato) !== chaveNome(centro.nome) && !centro.apelidos.some((a) => chaveNome(a) === chaveNome(textoContrato))) {
      await this.gravar('centros', { ...centro, apelidos: [...centro.apelidos, textoContrato], alterado: this.autoria() });
    }
    this.o.aoAlterar?.();
    return n;
  }

  async salvarFornecedor(n: NovoFornecedor): Promise<Fornecedor> {
    this.exigirAdmin();
    const nome = texto(n.nome);
    if (!nome) throw new Error('Informe o nome do fornecedor');
    const documento = texto(n.documento) ? documentoValido(n.documento!) : undefined;
    const pix = texto(n.chavePix) ? lerChavePix(n.chavePix!).chave : undefined;
    if (n.forma === 'pix' && !pix) throw new Error('Informe a chave Pix (forma de pagamento Pix)');
    const apelidos = juntarApelidos(nome, n.apelidos);
    const lista = await this.a.fornecedores.listar();
    const outro = this.conflito(lista, n.id, [nome, ...apelidos]);
    if (outro) throw new Error(`Já existe o fornecedor ${outro.nome}`);
    const mesmoDoc = documento && lista.find((f) => f.id !== n.id && f.documento === documento);
    if (mesmoDoc) throw new Error(`Esse CPF/CNPJ já está no fornecedor ${mesmoDoc.nome}`);
    const atual = n.id ? await this.a.fornecedores.obter(n.id) : undefined;
    const f: Fornecedor = { ...n, id: n.id ?? this.o.novoId(), nome, apelidos, ...this.carimbo(atual) };
    if (documento) f.documento = documento; else delete f.documento;
    if (pix) f.chavePix = pix; else delete f.chavePix;
    if (texto(n.observacao)) f.observacao = texto(n.observacao); else delete f.observacao;
    if (f.forma !== 'fatura' || !f.diaFechamento) delete f.diaFechamento;
    await this.gravar('fornecedores', f);
    this.o.aoAlterar?.();
    return f;
  }

  async salvarTipo(n: NovoTipo): Promise<TipoDespesa> {
    this.exigirAdmin();
    const nome = texto(n.nome);
    if (!nome) throw new Error('Informe o tipo de despesa');
    const apelidos = juntarApelidos(nome, n.apelidos);
    const outro = this.conflito(await this.a.tipos_despesa.listar(), n.id, [nome, ...apelidos]);
    if (outro) throw new Error(`Esse nome já é usado pelo tipo ${outro.nome}`);
    const atual = n.id ? await this.a.tipos_despesa.obter(n.id) : undefined;
    const t: TipoDespesa = { ...n, id: n.id ?? this.o.novoId(), nome, apelidos, ...this.carimbo(atual) };
    await this.gravar('tipos_despesa', t);
    this.o.aoAlterar?.();
    return t;
  }

  // ---------- Custos fixos mensais (dentro do centro de custo) ----------
  async salvarCustoFixo(centroId: string, n: NovoCustoFixo): Promise<CustoFixo> {
    this.exigirAdmin();
    const centro = await this.a.centros.obter(centroId);
    if (!centro) throw new Error('Escolha o centro de custo');
    const descricao = texto(n.descricao);
    if (!descricao) throw new Error('Informe a descrição do custo fixo');
    const tipo = (await this.a.tipos_despesa.listar()).find((t) => chaveNome(t.nome) === chaveNome(n.tipo ?? '') || t.apelidos.some((a) => chaveNome(a) === chaveNome(n.tipo ?? '')));
    if (!tipo) throw new Error(`Tipo de despesa "${n.tipo}" não cadastrado`);
    if (!(n.valor > 0)) throw new Error('Informe o valor mensal');
    if (!ehMes(n.inicio)) throw new Error('Informe o mês de início (mm/aaaa)');
    if (n.fim !== undefined && !ehMes(n.fim)) throw new Error('Mês de fim inválido (mm/aaaa)');
    if (n.fim && n.fim < n.inicio) throw new Error('O fim não pode ser antes do início');
    const c: CustoFixo = { id: n.id ?? this.o.novoId(), descricao, tipo: tipo.nome, valor: Math.round(n.valor * 100) / 100, inicio: n.inicio, ...(n.fim ? { fim: n.fim } : {}) };
    const lista = (centro.custosFixos ?? []).filter((x) => x.id !== c.id);
    await this.gravar('centros', { ...centro, custosFixos: [...lista, c].sort((a, b) => a.inicio.localeCompare(b.inicio)), alterado: this.autoria() });
    this.o.aoAlterar?.();
    return c;
  }

  async removerCustoFixo(centroId: string, id: string) {
    this.exigirAdmin();
    const centro = await this.a.centros.obter(centroId);
    if (!centro) throw new Error('Escolha o centro de custo');
    await this.gravar('centros', { ...centro, custosFixos: (centro.custosFixos ?? []).filter((x) => x.id !== id), alterado: this.autoria() });
    this.o.aoAlterar?.();
  }

  // ---------- Encargos ----------
  /** Cria um percentual de encargos ou altera nome/descrição. O percentual muda com definirPercentual (guarda o histórico). */
  async salvarEncargo(n: { id?: string; nome: string; descricao?: string; ativo: boolean; percentual?: number; desde?: string }): Promise<Encargo> {
    this.exigirAdmin();
    const nome = texto(n.nome);
    if (!nome) throw new Error('Informe o nome do encargo');
    const lista = await this.a.encargos.listar();
    if (lista.some((e) => e.id !== n.id && chaveNome(e.nome) === chaveNome(nome))) throw new Error(`Já existe o encargo ${nome}`);
    const atual = n.id ? await this.a.encargos.obter(n.id) : undefined;
    let vigencias = atual?.vigencias ?? [];
    if (!atual) {
      this.validarPercentual(n.percentual, n.desde);
      vigencias = [{ desde: n.desde!, percentual: n.percentual! }];
    }
    const e: Encargo = { id: n.id ?? this.o.novoId(), nome, vigencias, ativo: n.ativo, ...this.carimbo(atual) };
    if (texto(n.descricao)) e.descricao = texto(n.descricao);
    await this.gravar('encargos', e);
    this.o.aoAlterar?.();
    return e;
  }

  private validarPercentual(p?: number, desde?: string) {
    if (p === undefined || !(p >= 0 && p <= 200)) throw new Error('Percentual inválido (de 0 a 200%)');
    if (!ehMes(desde)) throw new Error('Informe a partir de qual mês vale (mm/aaaa)');
  }

  /** Novo percentual a partir de um mês. Os meses anteriores continuam com o percentual antigo. */
  async definirPercentual(encargoId: string, desde: string, percentual: number): Promise<Encargo> {
    this.exigirAdmin();
    const atual = await this.a.encargos.obter(encargoId);
    if (!atual) throw new Error('Encargo não encontrado');
    this.validarPercentual(percentual, desde);
    const vigencias = [...atual.vigencias.filter((v) => v.desde !== desde), { desde, percentual: Math.round(percentual * 100) / 100 }].sort((a, b) => a.desde.localeCompare(b.desde));
    const e = { ...atual, vigencias, alterado: this.autoria() };
    await this.gravar('encargos', e);
    this.o.aoAlterar?.();
    return e;
  }

  /** Cria o que ainda não existe: ALN e Passos com as contas informadas, os centros Administração e Estoque/Galpão (um de cada), os tipos de despesa e os encargos. */
  async criarCadastrosIniciais(): Promise<{ empresas: number; contas: number; centros: number; tipos: number; encargos: number }> {
    this.exigirAdmin();
    const r = { empresas: 0, contas: 0, centros: 0, tipos: 0, encargos: 0 };
    for (const ini of EMPRESAS_INICIAIS) {
      let e = (await this.a.empresas.listar()).find((x) => chaveNome(x.apelido) === chaveNome(ini.apelido));
      if (!e) { e = await this.salvarEmpresa({ apelido: ini.apelido, nome: ini.nome, ativo: true }); r.empresas++; }
      const contas = await this.a.contas.listar();
      for (const banco of ini.bancos) {
        if (contas.some((c) => c.empresaId === e!.id && chaveNome(c.banco) === chaveNome(banco))) continue;
        await this.salvarConta({ empresaId: e.id, banco, ativo: true });
        r.contas++;
      }
    }
    // Administração e galpão: um de cada, para as duas empresas.
    const centros = await this.a.centros.listar();
    for (const [especial, nome, apelidos] of [['administracao', 'Administração', ['ADM']], ['galpao', 'Estoque/Galpão', ['Galpão', 'Estoque']]] as const) {
      if (centros.some((c) => c.especial === especial)) continue;
      await this.salvarCentro({ nome, especial, apelidos: [...apelidos], ativo: true });
      r.centros++;
    }
    const tipos = await this.a.tipos_despesa.listar();
    for (const t of TIPOS_DESPESA_INICIAIS) {
      if (this.conflito(tipos, undefined, [t.nome])) continue;
      await this.salvarTipo({ nome: t.nome, apelidos: t.apelidos, ativo: true });
      r.tipos++;
    }
    const encargos = await this.a.encargos.listar();
    for (const e of ENCARGOS_INICIAIS) {
      if (encargos.some((x) => chaveNome(x.nome) === chaveNome(e.nome))) continue;
      await this.salvarEncargo({ nome: e.nome, descricao: e.descricao, percentual: e.percentual, desde: DESDE_SEMPRE, ativo: true });
      r.encargos++;
    }
    return r;
  }
}
