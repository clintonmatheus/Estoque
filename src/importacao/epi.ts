import type { Estoque } from '../dados/estoque';
import { CATEGORIA_EPI, ehEpi, grupoDoFuncionario, type Funcionario, type Item, type TipoTamanho } from '../domain/tipos';
import type { Abas } from './lerXlsx';
import { linhasDaAba, normalizar, numero, opcao, texto, type ErroImportacao } from './levantamento';

/** Abas e cabeçalhos das planilhas de EPI (modelos/Funcionarios_EPI.xlsx e modelos/Itens_EPI.xlsx). */
export const ABAS_EPI = {
  funcionarios: { nome: 'Funcionários EPI', colunas: ['Nome', 'CPF', 'Função', 'Calçado', 'Camisa', 'Luva', 'Situação'] },
  itens: {
    nome: 'Itens EPI',
    colunas: ['Item', 'Unidade', 'Nº do CA', 'Vida útil (dias)', 'Tamanhos disponíveis', 'Tamanho do funcionário', 'Estoque mínimo', 'Saldo inicial', 'Custo unitário (R$)'],
  },
} as const;

export const FORNECEDOR_SALDO_EPI = 'Saldo inicial (EPI)';

export interface LinhaFuncionarioEpi {
  linha: number; nome: string; cpf?: string; funcao?: string; tamanhos: Partial<Record<TipoTamanho, string>>; ativo: boolean;
}
export interface LinhaItemEpi {
  linha: number; nome: string; unidade?: string; ca?: string; vidaUtilDias?: number; tamanhos?: string[]; tipoTamanho?: TipoTamanho;
  minimo?: number; saldo?: number; custo?: number;
}
export interface DadosEpi { funcionarios: LinhaFuncionarioEpi[]; itens: LinhaItemEpi[]; erros: ErroImportacao[] }
export interface ResumoEpi {
  funcionarios: number; funcionariosAtualizados: number; itensNovos: number; itensAtualizados: number; itensComSaldo: number;
}

const TIPOS_TAMANHO = { calcado: 'calcado', camisa: 'camisa', luva: 'luva' } as const;
const SITUACAO = { ativo: true, inativo: false } as const;

/** CPF digitado como número perde o zero da frente: completa para 11 dígitos. */
function lerCpf(c: string | number | boolean | undefined): string | undefined {
  const t = texto(c);
  if (!t) return undefined;
  const n = t.replace(/\D/g, '');
  return typeof c === 'number' ? n.padStart(11, '0') : n;
}

export function lerEpi(abas: Abas): DadosEpi {
  const r: DadosEpi = { funcionarios: [], itens: [], erros: [] };

  for (const { linha, v } of linhasDaAba(abas, ABAS_EPI.funcionarios, r.erros)) {
    try {
      const nome = texto(v('Nome'));
      if (!nome) throw new Error('Informe o nome');
      const f: LinhaFuncionarioEpi = { linha, nome, tamanhos: {}, ativo: true };
      const cpf = lerCpf(v('CPF')); if (cpf) f.cpf = cpf;
      const funcao = texto(v('Função')); if (funcao) f.funcao = funcao;
      const calcado = texto(v('Calçado')); if (calcado) f.tamanhos.calcado = calcado;
      const camisa = texto(v('Camisa')); if (camisa) f.tamanhos.camisa = camisa;
      const luva = texto(v('Luva')); if (luva) f.tamanhos.luva = luva;
      f.ativo = opcao(v('Situação'), { ativo: 'ativo', inativo: 'inativo' } as const, 'Situação') !== 'inativo';
      r.funcionarios.push(f);
    } catch (e) { r.erros.push({ aba: ABAS_EPI.funcionarios.nome, linha, mensagem: (e as Error).message }); }
  }

  for (const { linha, v } of linhasDaAba(abas, ABAS_EPI.itens, r.erros)) {
    try {
      const nome = texto(v('Item'));
      if (!nome) throw new Error('Informe o nome do item');
      const i: LinhaItemEpi = { linha, nome };
      const unidade = texto(v('Unidade')); if (unidade) i.unidade = unidade;
      const ca = texto(v('Nº do CA')); if (ca) i.ca = ca.replace(/\.0$/, '');
      const vida = numero(v('Vida útil (dias)'));
      if (vida !== undefined) { if (!Number.isInteger(vida) || vida <= 0) throw new Error('Vida útil: informe os dias até a troca (número inteiro)'); i.vidaUtilDias = vida; }
      const tam = texto(v('Tamanhos disponíveis'));
      if (tam) i.tamanhos = [...new Set(tam.split(/[;,/]/).map((t) => t.trim()).filter(Boolean))];
      const tipo = opcao(v('Tamanho do funcionário'), { calcado: 'calcado', calçado: 'calcado', camisa: 'camisa', luva: 'luva' } as Record<string, TipoTamanho>, 'Tamanho do funcionário');
      if (tipo) i.tipoTamanho = tipo;
      const min = numero(v('Estoque mínimo'));
      if (min !== undefined) { if (min < 0) throw new Error('Estoque mínimo não pode ser negativo'); i.minimo = min; }
      const saldo = numero(v('Saldo inicial'));
      if (saldo !== undefined && saldo !== 0) {
        if (saldo < 0) throw new Error('Saldo inicial não pode ser negativo');
        i.saldo = saldo;
        const custo = numero(v('Custo unitário (R$)'));
        if (custo !== undefined) { if (custo < 0) throw new Error('Custo não pode ser negativo'); i.custo = custo; }
      }
      r.itens.push(i);
    } catch (e) { r.erros.push({ aba: ABAS_EPI.itens.nome, linha, mensagem: (e as Error).message }); }
  }
  return r;
}

const mesmoTamanho = (a?: Funcionario['tamanhos'], b?: Funcionario['tamanhos']) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/**
 * Grava no app. Com `erros`, anota e segue (simulação); sem `erros`, o primeiro problema interrompe com a aba e a linha.
 * Quem já existe (mesmo CPF ou nome no grupo de EPI; mesmo nome de item) só tem preenchido o que a planilha traz.
 */
export async function importarEpi(estoque: Estoque, dados: DadosEpi, data: string, erros?: ErroImportacao[]): Promise<ResumoEpi> {
  const resumo: ResumoEpi = { funcionarios: 0, funcionariosAtualizados: 0, itensNovos: 0, itensAtualizados: 0, itensComSaldo: 0 };
  const falha = (aba: string, linha: number, e: unknown) => {
    const mensagem = (e as Error).message;
    if (!erros) throw new Error(`${aba}, linha ${linha}: ${mensagem}`);
    erros.push({ aba, linha, mensagem });
  };

  // Funcionários de EPI
  const existentes = (await estoque.funcionarios(true, 'epi'));
  const vistos = new Set<string>();
  for (const f of dados.funcionarios) {
    try {
      const chave = f.cpf ?? normalizar(f.nome);
      if (vistos.has(chave)) throw new Error('Funcionário repetido na planilha');
      vistos.add(chave);
      const atual = existentes.find((x) => grupoDoFuncionario(x) === 'epi' && ((f.cpf && x.cpf === f.cpf) || normalizar(x.nome) === normalizar(f.nome)));
      if (!atual) {
        const novo = await estoque.salvarFuncionario({ nome: f.nome, ativo: f.ativo, grupo: 'epi', cpf: f.cpf, funcao: f.funcao, tamanhos: f.tamanhos });
        existentes.push(novo);
        resumo.funcionarios++;
        continue;
      }
      const tamanhos = { ...atual.tamanhos, ...f.tamanhos };
      if ((f.cpf && f.cpf !== atual.cpf) || (f.funcao && f.funcao !== atual.funcao) || !mesmoTamanho(tamanhos, atual.tamanhos)) {
        await estoque.salvarFuncionario({ ...atual, cpf: f.cpf ?? atual.cpf, funcao: f.funcao ?? atual.funcao, tamanhos });
        resumo.funcionariosAtualizados++;
      }
    } catch (e) { falha(ABAS_EPI.funcionarios.nome, f.linha, e); }
  }

  // Itens de EPI e saldo inicial
  const itens = new Map((await estoque.itens(true)).map((i) => [normalizar(i.nome), i]));
  const posicao = await estoque.posicao();
  const vistosItens = new Set<string>();
  const entrada: { itemId: string; quantidade: number; custoUnitario: number }[] = [];
  let primeira = 0;
  for (const m of dados.itens) {
    try {
      const k = normalizar(m.nome);
      if (vistosItens.has(k)) throw new Error('Item repetido na planilha');
      vistosItens.add(k);
      let item: Item | undefined = itens.get(k);
      const campos = {
        ...(m.ca ? { ca: m.ca } : {}), ...(m.vidaUtilDias ? { vidaUtilDias: m.vidaUtilDias } : {}), ...(m.tamanhos?.length ? { tamanhos: m.tamanhos } : {}),
        ...(m.tipoTamanho ? { tipoTamanho: m.tipoTamanho } : {}), ...(m.minimo !== undefined ? { estoqueMinimo: m.minimo } : {}),
        ...(m.custo !== undefined ? { custoReferencia: m.custo } : {}),
      };
      if (!item) {
        if (!m.unidade) throw new Error('Item novo: informe a unidade');
        item = await estoque.salvarItem({ estoqueMinimo: 0, ...campos, nome: m.nome, unidade: m.unidade, categoria: CATEGORIA_EPI, ativo: true });
        itens.set(k, item);
        resumo.itensNovos++;
      } else {
        if (!ehEpi(item)) throw new Error(`${item.nome} já está cadastrado como material do galpão`);
        const novo = { ...item, ...campos, ...(m.unidade ? { unidade: m.unidade } : {}) };
        if (JSON.stringify(novo) !== JSON.stringify(item)) {
          item = await estoque.salvarItem(novo);
          itens.set(k, item);
          resumo.itensAtualizados++;
        }
      }
      if (m.saldo) {
        const atual = posicao.itens[item.id]?.quantidade ?? 0;
        if (atual > 0) throw new Error(`${item.nome} já tem saldo no app (${atual} ${item.unidade}); para corrigir use o Inventário de EPI`);
        entrada.push({ itemId: item.id, quantidade: m.saldo, custoUnitario: m.custo ?? 0 });
        if (!primeira) primeira = m.linha;
      }
    } catch (e) { falha(ABAS_EPI.itens.nome, m.linha, e); }
  }
  if (entrada.length) {
    try {
      await estoque.lancar({ tipo: 'entrada', data, fornecedor: FORNECEDOR_SALDO_EPI, observacao: 'Importado da planilha de EPI', linhas: entrada });
      resumo.itensComSaldo = entrada.length;
    } catch (e) { falha(ABAS_EPI.itens.nome, primeira, e); }
  }
  return resumo;
}

/** Faz a importação numa cópia dos dados: devolve o que seria gravado e todos os problemas, sem gravar nada. */
export async function simularEpi(estoque: Estoque, dados: DadosEpi, data: string): Promise<{ resumo: ResumoEpi; erros: ErroImportacao[] }> {
  const erros: ErroImportacao[] = [...dados.erros];
  const copia = await estoque.copiaParaSimulacao();
  const resumo = await importarEpi(copia, dados, data, erros);
  return { resumo, erros };
}
