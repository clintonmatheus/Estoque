import type { Usuario } from '../domain/tipos';

export interface Autenticacao {
  /** Usuário da sessão guardada no aparelho (funciona sem internet), se houver. */
  usuarioAtual(): Promise<Usuario | undefined>;
  /** Lança 'E-mail ou senha incorretos' ou 'Sem conexão'. */
  entrar(email: string, senha: string): Promise<Usuario>;
  sair(): Promise<void>;
  /** Relê nome e papel no servidor; undefined se offline. */
  atualizarPerfil(): Promise<Usuario | undefined>;
}

/** Linha de saldo sem valores (o que o consultor enxerga). */
export interface SaldoSimples {
  itemId: string;
  nome: string;
  unidade: string;
  embalagem?: { nome: string; fator: number };
  estoqueMinimo: number;
  saldo: number;
}
