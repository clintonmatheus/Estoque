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

/** Ferramenta individual (ex.: "Furadeira 03"), emprestada a funcionários. */
export interface Ferramenta {
  id: string;
  nome: string;
  /** Número/etiqueta da unidade (ex.: "03"). */
  codigo?: string;
  ativo: boolean;
  criado: Autoria;
  alterado?: Autoria;
}

/** Saída de uma ferramenta com um funcionário, com data prevista de devolução. */
export interface Emprestimo {
  id: string;
  ferramentaId: string;
  funcionarioId: string;
  /** Frente de serviço onde será usada (opcional). */
  localId?: string;
  /** Dia em que saiu do galpão. */
  saida: string;
  /** Dia previsto para a devolução. */
  prevista: string;
  /** Dia em que voltou (vazio enquanto está fora). */
  devolvidoEm?: string;
  observacao?: string;
  /** Estado em que voltou (ex.: "cabo quebrado"). */
  observacaoDevolucao?: string;
  criado: Autoria;
  /** Quem registrou a devolução. */
  devolvido?: Autoria;
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
