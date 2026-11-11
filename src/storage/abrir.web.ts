import type { Armazenamento } from './contrato';
import { criarArmazenamentoMemoria } from './memoria';

/** Navegador: em memória, carregado do servidor a cada acesso (o computador fica online). */
export async function abrirArmazenamento(): Promise<Armazenamento> {
  return criarArmazenamentoMemoria();
}
