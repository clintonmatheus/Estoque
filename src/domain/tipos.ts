export type Papel = 'admin' | 'almoxarife' | 'consultor';

export interface Usuario { id: string; nome: string; papel: Papel }

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
  /** Contrato ao qual a frente pertence (ex.: "Escritórios da RMG"). */
  centroCusto: string;
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

/** Dados do contrato de locação de um equipamento locado. */
export interface Locacao {
  locadora: string;
  contrato?: string;
  /** Valor por peça no período. */
  valor?: number;
  periodo?: 'dia' | 'mes';
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

