import type { Tabela } from '../storage/contrato';

/**
 * Confere o formato mínimo de um documento baixado do servidor antes de guardá-lo no aparelho.
 * O servidor aceita qualquer JSON em "dados": sem esta conferência, um registro malformado gravado por outra pessoa
 * quebrava as listas (pagamentos, estoque) de quem sincroniza. Registro reprovado é ignorado, os demais seguem.
 */
const texto = (v: unknown): v is string => typeof v === 'string';
const data = (v: unknown) => texto(v) && /^\d{4}-\d{2}-\d{2}/.test(v);
const autoria = (v: unknown) => {
  const a = v as { id?: unknown; nome?: unknown; em?: unknown } | null;
  return !!a && typeof a === 'object' && texto(a.id) && texto(a.nome) && texto(a.em);
};
/** Id seguro: também vira nome de arquivo no celular (anexos), então só letras, números, "-" e "_". */
export const idSeguro = (v: unknown): v is string => texto(v) && /^[A-Za-z0-9_-]{1,100}$/.test(v);

const COM_NOME: Tabela[] = ['itens', 'locais', 'bens', 'centros', 'fornecedores', 'tipos_despesa', 'encargos', 'empresas'];
const COM_DATA: Tabela[] = ['movimentos', 'movimentos_bens', 'compras'];
const STATUS = ['enviado', 'aprovacao', 'pronto', 'pago', 'devolvido', 'rejeitado', 'cancelado'];

export function documentoValido(t: Tabela, d: unknown): boolean {
  const x = d as Record<string, unknown> | null;
  if (!x || typeof x !== 'object' || Array.isArray(x) || !idSeguro(x.id)) return false;
  if (t !== 'funcionarios' && !autoria(x.criado)) return false;
  if (COM_NOME.includes(t) && !texto(x.nome)) return false;
  if (COM_DATA.includes(t) && !data(x.data)) return false;
  if (t === 'movimentos' && !texto(x.itemId)) return false;
  if (t === 'pedidos' && (!STATUS.includes(x.status as string) || !Array.isArray(x.historico))) return false;
  if (t === 'anexos' && x.formato !== undefined && !texto(x.formato)) return false;
  return true;
}
