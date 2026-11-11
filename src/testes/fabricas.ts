import { Estoque } from '../dados/estoque';
import type { Usuario } from '../domain/tipos';
import type { Armazenamento } from '../storage/contrato';
import { criarArmazenamentoMemoria } from '../storage/memoria';

export const MARILIA: Usuario = { id: 'u-marilia', nome: 'Marilia', papel: 'almoxarife' };
export const CLINTON: Usuario = { id: 'u-clinton', nome: 'Clinton', papel: 'admin' };
export const ARTHUR: Usuario = { id: 'u-arthur', nome: 'Arthur', papel: 'consultor' };

let relogio = 0;
let seq = 0;
/** Estoque em memória para testes; `agora` avança 1 s a cada uso. */
export function estoqueDeTeste(usuario: Usuario = MARILIA, a: Armazenamento = criarArmazenamentoMemoria()) {
  const estoque = new Estoque(a, usuario, {
    agora: () => new Date(Date.UTC(2026, 10, 11, 12, 0, relogio++)).toISOString(),
    novoId: () => `${usuario.id}-${++seq}`,
  });
  return { estoque, armazenamento: a };
}

/** Estoque com 1 item (tinta), 2 frentes e 1 funcionário cadastrados. */
export async function estoqueComCadastros(usuario: Usuario = MARILIA) {
  const t = estoqueDeTeste(usuario);
  const tinta = await t.estoque.salvarItem({ nome: 'Tinta branca 18L', unidade: 'lata', estoqueMinimo: 2, ativo: true });
  const piso = await t.estoque.salvarItem({ nome: 'Revestimento 46x46', unidade: 'pç', embalagem: { nome: 'cx', fator: 11 }, estoqueMinimo: 0, ativo: true });
  const riachuelo = await t.estoque.salvarLocal({ nome: 'Riachuelo', centroCusto: 'Escritórios da RMG', ativo: true });
  const macaiba = await t.estoque.salvarLocal({ nome: 'Macaíba', centroCusto: 'Escritórios da RMG', ativo: true });
  const joao = await t.estoque.salvarFuncionario({ nome: 'João', ativo: true });
  return { ...t, tinta, piso, riachuelo, macaiba, joao };
}
