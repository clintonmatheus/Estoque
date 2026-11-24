export type Papel = 'admin' | 'almoxarife' | 'consultor';

/** Perfil no módulo financeiro, independente do papel no galpão. */
export type PapelFinanceiro = 'admin' | 'pagador' | 'solicitante';

export interface Usuario { id: string; nome: string; papel: Papel; financeiro?: PapelFinanceiro }

export const temFinanceiro = (u: Usuario) => !!u.financeiro;
export const ehAdminFinanceiro = (u: Usuario) => u.financeiro === 'admin';
/** Quem grava no aparelho e sincroniza (lança no galpão ou usa o financeiro). */
export const usaSincronizacao = (u: Usuario) => podeLancar(u) || temFinanceiro(u);

/** Administrador e almoxarife lançam movimentos e veem valores; consultor só vê saldos. */
export const podeLancar = (u: Usuario) => u.papel === 'admin' || u.papel === 'almoxarife';

/** Quem fez e quando (ISO UTC). */
export interface Autoria { id: string; nome: string; em: string }

export interface Embalagem {
  /** Ex.: "cx" */
  nome: string;
  /** Quantas unidades básicas cabem na embalagem (ex.: 11 peças por caixa). */
  fator: number;
}

export interface Item {
  id: string;
  nome: string;
  /** Unidade em que o saldo é controlado (ex.: "pç", "lata", "kg"). */
  unidade: string;
  /** Embalagem opcional para entradas/saídas fechadas (ex.: caixa com 11 peças). */
  embalagem?: Embalagem;
  estoqueMinimo: number;
  /** Pintura, Elétrica… (vazio: sugerida pelo nome). */
  categoria?: string;
  /** Custo usado quando ainda não há compra registrada (ex.: contagem inicial). */
  custoReferencia?: number;
  ativo: boolean;
  criado: Autoria;
  alterado?: Autoria;
}

export interface Local {
  id: string;
  /** Frente de serviço (ex.: "Riachuelo"). */
  nome: string;
  /** Contrato ao qual a frente pertence (ex.: "Escritórios da RMG"). Nome do centro de custo vinculado, quando houver. */
  centroCusto: string;
  /** Centro de custo do financeiro ao qual a frente pertence. */
  centroId?: string;
  ativo: boolean;
  criado: Autoria;
  alterado?: Autoria;
}

export interface Funcionario { id: string; nome: string; ativo: boolean; criado: Autoria; alterado?: Autoria }

/**
 * entrada: compra (ou sobra sem obra de origem) que entra no galpão;
 * saida: galpão → frente de serviço; devolucao: sobra da frente → galpão;
 * transferencia: frente → outra frente (não passa pelo galpão); ajuste: correção de inventário (+/-);
 * epi: entrega de EPI a um funcionário (baixa o galpão, sem custo para frente/centro de custo).
 */
export type TipoMovimento = 'entrada' | 'saida' | 'devolucao' | 'transferencia' | 'ajuste' | 'epi';

export interface Movimento {
  id: string;
  /** Lançamento que reuniu várias linhas (uma nota fiscal, uma retirada). */
  grupo: string;
  tipo: TipoMovimento;
  /** Dia do movimento (AAAA-MM-DD). */
  data: string;
  itemId: string;
  /** Na unidade do item. Positiva, exceto no ajuste (negativa quando falta material). */
  quantidade: number;
  /** Entrada e ajuste positivo: custo por unidade. */
  custoUnitario?: number;
  notaFiscal?: string;
  fornecedor?: string;
  /** Saída: destino. Devolução/transferência: origem. */
  localId?: string;
  /** Transferência: destino. */
  localDestinoId?: string;
  /** Quem retirou (saída) ou devolveu. */
  funcionarioId?: string;
  observacao?: string;
  /** EPI: número do Certificado de Aprovação. */
  ca?: string;
  /** EPI: tamanho/numeração entregue (ex.: "42", "G"). */
  tamanho?: string;
  /** EPI: data (AAAA-MM-DD) em que o equipamento deve ser trocado. */
  validade?: string;
  criado: Autoria;
  alterado?: Autoria;
  cancelado?: Autoria & { motivo: string };
}

/** Onde um bem (ferramenta ou equipamento locado) está. */
export type Posse =
  | { tipo: 'externo' }
  | { tipo: 'galpao' }
  | { tipo: 'campo'; funcionarioId: string; localId: string };

export type MotivoSaidaBem = 'devolucao-locadora' | 'perda' | 'baixa';

/** Período em que a locadora cobra o valor por peça. */
export type PeriodoLocacao = 'dia' | 'semana' | 'quinzena' | 'mes';
export const PERIODOS_LOCACAO: { id: PeriodoLocacao; titulo: string; por: string }[] = [
  { id: 'dia', titulo: 'Diária', por: 'dia' },
  { id: 'semana', titulo: 'Semanal', por: 'semana' },
  { id: 'quinzena', titulo: 'Quinzenal', por: 'quinzena' },
  { id: 'mes', titulo: 'Mensal', por: 'mês' },
];
export const porPeriodo = (p?: PeriodoLocacao) => PERIODOS_LOCACAO.find((x) => x.id === p)?.por ?? 'mês';

/** Dados do contrato de locação de um equipamento locado. */
export interface Locacao {
  locadora: string;
  contrato?: string;
  /** Valor por peça no período. */
  valor?: number;
  periodo?: PeriodoLocacao;
  inicio?: string;
  /** Data prevista para devolver o equipamento à locadora. */
  prevista?: string;
  /** Frente de serviço em que a locadora cobra este equipamento. */
  localCobrancaId?: string;
}

/**
 * Ferramenta própria ou equipamento locado (andaime, escora, sapata, piso...).
 * controle 'unidade': cada exemplar é um cadastro (Furadeira 03). 'quantidade': conta peças (120 escoras).
 */
export interface Bem {
  id: string;
  nome: string;
  codigo?: string;
  tipo: 'ferramenta' | 'locado';
  controle: 'unidade' | 'quantidade';
  ativo: boolean;
  locacao?: Locacao;
  observacao?: string;
  criado: Autoria;
  alterado?: Autoria;
}

/** Mudança de posse de um bem: levantamento/chegada (origem externa), transferência ou saída (devolução, perda). */
export interface MovimentoBem {
  id: string;
  bemId: string;
  data: string;
  quantidade: number;
  origem: Posse;
  destino: Posse;
  /** Obrigatório quando o destino é externo. */
  motivo?: MotivoSaidaBem;
  /** Dia previsto para a ferramenta voltar (unidades que vão para o campo). */
  prevista?: string;
  observacao?: string;
  criado: Autoria;
  alterado?: Autoria;
  cancelado?: Autoria & { motivo: string };
}

/** Foto anexada a um lançamento (ex.: pedido recebido pelo WhatsApp). */
export interface Anexo {
  id: string;
  grupo: string;
  /** Endereço local no aparelho ('' enquanto não baixado). */
  uri: string;
  caminhoRemoto?: string;
  criado: Autoria;
  excluido?: boolean;
}


// ---------- Financeiro: cadastros (etapa 1) ----------

/** ALN, Passos… A empresa paga (conta de saída e nota fiscal); o custo vai para qualquer centro de custo. */
export interface Empresa {
  id: string;
  /** Nome curto usado nas telas e planilhas (ex.: "ALN"). */
  apelido: string;
  /** Razão social. */
  nome: string;
  cnpj?: string;
  ativo: boolean;
  criado: Autoria;
  alterado?: Autoria;
}

export interface ContaBancaria {
  id: string;
  empresaId: string;
  banco: string;
  agencia?: string;
  numero?: string;
  /** Ex.: "BB ALN", "Inter Passos". */
  apelido: string;
  ativo: boolean;
  criado: Autoria;
  alterado?: Autoria;
}

/** administracao: rateado entre as obras; galpao: material comprado para o estoque. */
export type CentroEspecial = 'administracao' | 'galpao';

/**
 * Centro de custo (contrato), ex.: RMG Água, FUNPEC, SMS. As frentes de serviço ficam dentro dele.
 * A administração das duas empresas é uma só: um pagamento da Passos pode entrar numa obra da ALN.
 */
export interface CentroCusto {
  id: string;
  nome: string;
  /** Empresa do contrato (informativo; não limita quem paga). */
  empresaId?: string;
  especial?: CentroEspecial;
  /** Outras grafias usadas nas planilhas (ex.: "RMG AGUA"). */
  apelidos: string[];
  /** Custos que entram todo mês (ex.: despesa geral de R$ 20.000 do RMG Água). */
  custosFixos?: CustoFixo[];
  ativo: boolean;
  criado: Autoria;
  alterado?: Autoria;
}

/** Custo lançado sozinho no último dia de cada mês, de `inicio` até `fim` (inclusive), no formato AAAA-MM. */
export interface CustoFixo {
  id: string;
  descricao: string;
  /** Nome do tipo de despesa (ex.: "Despesa geral"). */
  tipo: string;
  valor: number;
  inicio: string;
  fim?: string;
}

/** Percentual de encargos sociais sobre a folha, com histórico: cada vigência vale a partir do mês indicado. */
export interface Encargo {
  id: string;
  nome: string;
  /** A quem se aplica (texto livre). */
  descricao?: string;
  vigencias: { desde: string; percentual: number }[];
  ativo: boolean;
  criado: Autoria;
  alterado?: Autoria;
}

export type FormaPagamento = 'pix' | 'boleto' | 'fatura';
export const FORMAS_PAGAMENTO: { id: FormaPagamento; titulo: string }[] = [
  { id: 'pix', titulo: 'Pix' }, { id: 'boleto', titulo: 'Boleto' }, { id: 'fatura', titulo: 'Fatura semanal' },
];

export type DiaSemana = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo';
export const DIAS_SEMANA: { id: DiaSemana; titulo: string }[] = [
  { id: 'segunda', titulo: 'Segunda' }, { id: 'terca', titulo: 'Terça' }, { id: 'quarta', titulo: 'Quarta' }, { id: 'quinta', titulo: 'Quinta' },
  { id: 'sexta', titulo: 'Sexta' }, { id: 'sabado', titulo: 'Sábado' }, { id: 'domingo', titulo: 'Domingo' },
];

export interface Fornecedor {
  id: string;
  nome: string;
  /** CPF ou CNPJ, só números. */
  documento?: string;
  chavePix?: string;
  forma: FormaPagamento;
  /** Dia em que a loja fecha a fatura semanal. */
  diaFechamento?: DiaSemana;
  observacao?: string;
  apelidos: string[];
  ativo: boolean;
  criado: Autoria;
  alterado?: Autoria;
}

export interface TipoDespesa {
  id: string;
  nome: string;
  apelidos: string[];
  ativo: boolean;
  criado: Autoria;
  alterado?: Autoria;
}
