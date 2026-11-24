import type { Financeiro } from '../dados/financeiro';
import { acharPorNome, chaveNome, cpfValido, juntarApelidos, soNumeros } from '../domain/nomes';
import { DIAS_SEMANA, type CentroEspecial, type DiaSemana, type FormaPagamento } from '../domain/tipos';
import type { Abas, Celula } from './lerXlsx';
import { linhasDaAba, normalizar, opcao, texto, type ErroImportacao } from './levantamento';

/** Abas e cabeçalhos da planilha de cadastros do financeiro (modelos/Cadastros_Financeiro.xlsx). */
export const ABAS_FIN = {
  empresas: { nome: 'Empresas', colunas: ['Nome curto', 'Razão social', 'CNPJ'] },
  contas: { nome: 'Contas bancárias', colunas: ['Empresa', 'Banco', 'Agência', 'Conta', 'Nome da conta'] },
  centros: { nome: 'Centros de custo', colunas: ['Centro de custo', 'Tipo', 'Situação', 'Empresa do contrato', 'Outros nomes'] },
  frentes: { nome: 'Frentes de serviço', colunas: ['Frente de serviço', 'Centro de custo'] },
  fornecedores: { nome: 'Fornecedores', colunas: ['Nome', 'CPF ou CNPJ', 'Chave Pix', 'Forma de pagamento', 'Dia de fechamento', 'Outros nomes', 'Observação'] },
  tipos: { nome: 'Tipos de despesa', colunas: ['Tipo de despesa', 'Outros nomes'] },
} as const;

interface ComLinha { linha: number }
export interface CadastrosFinanceiro {
  empresas: (ComLinha & { apelido: string; nome: string; cnpj?: string })[];
  contas: (ComLinha & { empresa: string; banco: string; agencia?: string; numero?: string; apelido?: string })[];
  centros: (ComLinha & { nome: string; empresa?: string; especial?: CentroEspecial; ativo: boolean; apelidos: string[] })[];
  frentes: (ComLinha & { nome: string; centro: string })[];
  fornecedores: (ComLinha & { nome: string; documento?: string; chavePix?: string; forma: FormaPagamento; diaFechamento?: DiaSemana; apelidos: string[]; observacao?: string })[];
  tipos: (ComLinha & { nome: string; apelidos: string[] })[];
  erros: ErroImportacao[];
}

const lista = (c: Celula) => (texto(c) ?? '').split(/[;\n]/).map((x) => x.trim()).filter(Boolean);

/** CPF/CNPJ digitado como número perde o zero da frente no Excel: recoloca. */
function documento(c: Celula): string | undefined {
  const t = texto(c);
  if (!t) return undefined;
  let n = soNumeros(t);
  if (typeof c === 'number') n = n.length <= 11 && cpfValido(n.padStart(11, '0')) ? n.padStart(11, '0') : n.padStart(14, '0');
  return n || t;
}

const TIPOS_CENTRO: Record<string, CentroEspecial | 'obra'> = {
  obra: 'obra', contrato: 'obra', 'obra/contrato': 'obra', administracao: 'administracao', adm: 'administracao',
  'estoque/galpao': 'galpao', galpao: 'galpao', estoque: 'galpao',
};
const SITUACOES: Record<string, 'ativo' | 'parado'> = { ativo: 'ativo', ativa: 'ativo', parado: 'parado', parada: 'parado', inativo: 'parado', desativado: 'parado' };
const FORMAS: Record<string, FormaPagamento> = { pix: 'pix', boleto: 'boleto', 'fatura semanal': 'fatura', fatura: 'fatura', 'a faturar': 'fatura' };
const DIAS = Object.fromEntries(DIAS_SEMANA.flatMap((d) => [[normalizar(d.titulo), d.id], [normalizar(d.titulo.slice(0, 3)), d.id], [`${normalizar(d.titulo)}-feira`, d.id]])) as Record<string, DiaSemana>;

/** Opção de lista com mensagem curta (as variações aceitas não aparecem no erro). */
function escolha<T extends string>(c: Celula, valores: Record<string, T>, campo: string, aceitos: string): T | undefined {
  try { return opcao(c, valores, campo); } catch { throw new Error(`${campo} inválido: "${texto(c)}" (use ${aceitos})`); }
}

/** Interpreta a planilha e confere o formato de cada linha. Ligações por nome (empresa, centro) são conferidas na importação. */
export function lerCadastrosFinanceiro(abas: Abas): CadastrosFinanceiro {
  const r: CadastrosFinanceiro = { empresas: [], contas: [], centros: [], frentes: [], fornecedores: [], tipos: [], erros: [] };
  const cada = <T>(aba: { nome: string; colunas: readonly string[] }, f: (v: (c: string) => Celula, linha: number) => T, destino: T[]) => {
    for (const { linha, v } of linhasDaAba(abas, aba, r.erros)) {
      try { destino.push(f(v, linha)); } catch (e) { r.erros.push({ aba: aba.nome, linha, mensagem: (e as Error).message }); }
    }
  };
  const exigir = (c: Celula, msg: string) => { const t = texto(c); if (!t) throw new Error(msg); return t; };

  cada(ABAS_FIN.empresas, (v, linha) => ({
    linha, apelido: exigir(v('Nome curto'), 'Informe o nome curto (ex.: ALN)'), nome: exigir(v('Razão social'), 'Informe a razão social'), cnpj: documento(v('CNPJ')),
  }), r.empresas);
  cada(ABAS_FIN.contas, (v, linha) => ({
    linha, empresa: exigir(v('Empresa'), 'Informe a empresa'), banco: exigir(v('Banco'), 'Informe o banco'),
    agencia: texto(v('Agência')), numero: texto(v('Conta')), apelido: texto(v('Nome da conta')),
  }), r.contas);
  cada(ABAS_FIN.centros, (v, linha) => {
    const tipo = escolha(v('Tipo'), TIPOS_CENTRO, 'Tipo', 'Obra, Administração ou Estoque/Galpão') ?? 'obra';
    const situacao = escolha(v('Situação'), SITUACOES, 'Situação', 'Ativo ou Parado') ?? 'ativo';
    const empresa = texto(v('Empresa do contrato'));
    return {
      linha, nome: exigir(v('Centro de custo'), 'Informe o centro de custo'), ...(empresa ? { empresa } : {}),
      ...(tipo !== 'obra' ? { especial: tipo } : {}), ativo: situacao === 'ativo', apelidos: lista(v('Outros nomes')),
    };
  }, r.centros);
  cada(ABAS_FIN.frentes, (v, linha) => ({
    linha, nome: exigir(v('Frente de serviço'), 'Informe a frente de serviço'), centro: exigir(v('Centro de custo'), 'Informe o centro de custo'),
  }), r.frentes);
  cada(ABAS_FIN.fornecedores, (v, linha) => {
    const forma = escolha(v('Forma de pagamento'), FORMAS, 'Forma de pagamento', 'Pix, Boleto ou Fatura semanal');
    if (!forma) throw new Error('Informe a forma de pagamento (Pix, Boleto ou Fatura semanal)');
    const dia = escolha(v('Dia de fechamento'), DIAS, 'Dia de fechamento', 'um dia da semana, ex.: Sexta');
    const pix = texto(v('Chave Pix'));
    const celPix = v('Chave Pix');
    return {
      linha, nome: exigir(v('Nome'), 'Informe o nome do fornecedor'), documento: documento(v('CPF ou CNPJ')),
      chavePix: typeof celPix === 'number' ? documento(celPix) : pix, forma, ...(dia ? { diaFechamento: dia } : {}),
      apelidos: lista(v('Outros nomes')), observacao: texto(v('Observação')),
    };
  }, r.fornecedores);
  cada(ABAS_FIN.tipos, (v, linha) => ({ linha, nome: exigir(v('Tipo de despesa'), 'Informe o tipo de despesa'), apelidos: lista(v('Outros nomes')) }), r.tipos);
  return r;
}

export interface ResumoCadastros {
  empresas: number; contas: number; centros: number; frentes: number; frentesLigadas: number; fornecedores: number; tipos: number;
  /** Já existiam no app (ficaram como estavam; outros nomes novos foram acrescentados). */
  existentes: number;
}

/** Grava os cadastros. Com `erros`, anota e segue (simulação); sem `erros`, para no primeiro problema com aba e linha. */
export async function importarCadastrosFinanceiro(fin: Financeiro, cad: CadastrosFinanceiro, erros?: ErroImportacao[]): Promise<ResumoCadastros> {
  const r: ResumoCadastros = { empresas: 0, contas: 0, centros: 0, frentes: 0, frentesLigadas: 0, fornecedores: 0, tipos: 0, existentes: 0 };
  const falha = (aba: string, linha: number, e: unknown) => {
    const mensagem = (e as Error).message;
    if (!erros) throw new Error(`${aba}, linha ${linha}: ${mensagem}`);
    erros.push({ aba, linha, mensagem });
  };
  const tentar = async (aba: string, linha: number, f: () => Promise<void>) => { try { await f(); } catch (e) { falha(aba, linha, e); } };

  const empresaPor = async (nome: string) => {
    const e = (await fin.empresas(true)).find((x) => chaveNome(x.apelido) === chaveNome(nome) || chaveNome(x.nome) === chaveNome(nome));
    if (!e) throw new Error(`Empresa "${nome}" não encontrada (cadastre na aba Empresas ou no app)`);
    return e;
  };

  for (const l of cad.empresas) {
    await tentar(ABAS_FIN.empresas.nome, l.linha, async () => {
      if ((await fin.empresas(true)).some((x) => chaveNome(x.apelido) === chaveNome(l.apelido))) { r.existentes++; return; }
      await fin.salvarEmpresa({ apelido: l.apelido, nome: l.nome, ...(l.cnpj ? { cnpj: l.cnpj } : {}), ativo: true });
      r.empresas++;
    });
  }

  for (const l of cad.contas) {
    await tentar(ABAS_FIN.contas.nome, l.linha, async () => {
      const e = await empresaPor(l.empresa);
      const contas = await fin.contas(true);
      const mesma = contas.find((c) => c.empresaId === e.id && chaveNome(c.banco) === chaveNome(l.banco) && (c.numero ?? '') === (l.numero ?? '')) ??
        (l.apelido ? contas.find((c) => chaveNome(c.apelido) === chaveNome(l.apelido!)) : undefined);
      if (mesma) { r.existentes++; return; }
      await fin.salvarConta({ empresaId: e.id, banco: l.banco, agencia: l.agencia, numero: l.numero, apelido: l.apelido, ativo: true });
      r.contas++;
    });
  }

  for (const l of cad.centros) {
    await tentar(ABAS_FIN.centros.nome, l.linha, async () => {
      const e = l.empresa ? await empresaPor(l.empresa) : undefined;
      const atual = acharPorNome(await fin.centros(true), l.nome);
      if (atual) {
        const apelidos = juntarApelidos(atual.nome, atual.apelidos, l.apelidos);
        if (apelidos.length !== atual.apelidos.length) await fin.salvarCentro({ ...atual, apelidos });
        r.existentes++;
        return;
      }
      await fin.salvarCentro({ nome: l.nome, apelidos: l.apelidos, ativo: l.ativo, ...(e ? { empresaId: e.id } : {}), ...(l.especial ? { especial: l.especial } : {}) });
      r.centros++;
    });
  }

  // Frentes do estoque cujo contrato (texto) é o nome ou outro nome de um centro: ligadas automaticamente.
  const centrosAgora = await fin.centros(true);
  for (const g of await fin.frentesSemCentro()) {
    const centro = acharPorNome(centrosAgora, g.texto);
    if (centro) r.frentesLigadas += await fin.vincularFrentes(g.texto, centro.id);
  }

  for (const l of cad.frentes) {
    await tentar(ABAS_FIN.frentes.nome, l.linha, async () => {
      const centro = acharPorNome(await fin.centros(true), l.centro);
      if (!centro) throw new Error(`Centro de custo "${l.centro}" não encontrado`);
      const existentes = (await fin.frentes(true)).filter((f) => chaveNome(f.nome) === chaveNome(l.nome));
      const noCentro = existentes.find((f) => f.centroId === centro.id);
      if (noCentro) { r.existentes++; return; }
      const solta = existentes.find((f) => !f.centroId);
      if (solta) { await fin.salvarFrente({ id: solta.id, nome: solta.nome, centroId: centro.id, ativo: solta.ativo }); r.frentesLigadas++; return; }
      await fin.salvarFrente({ nome: l.nome, centroId: centro.id, ativo: true });
      r.frentes++;
    });
  }

  for (const l of cad.fornecedores) {
    await tentar(ABAS_FIN.fornecedores.nome, l.linha, async () => {
      const lista = await fin.fornecedores(true);
      if (acharPorNome(lista, l.nome) || (l.documento && lista.some((f) => f.documento === soNumeros(l.documento!)))) { r.existentes++; return; }
      await fin.salvarFornecedor({
        nome: l.nome, documento: l.documento, chavePix: l.chavePix, forma: l.forma, apelidos: l.apelidos, observacao: l.observacao, ativo: true,
        ...(l.diaFechamento ? { diaFechamento: l.diaFechamento } : {}),
      });
      r.fornecedores++;
    });
  }

  for (const l of cad.tipos) {
    await tentar(ABAS_FIN.tipos.nome, l.linha, async () => {
      const atual = acharPorNome(await fin.tipos(true), l.nome);
      if (atual) {
        const apelidos = juntarApelidos(atual.nome, atual.apelidos, l.apelidos);
        if (apelidos.length !== atual.apelidos.length) await fin.salvarTipo({ ...atual, apelidos });
        r.existentes++;
        return;
      }
      await fin.salvarTipo({ nome: l.nome, apelidos: l.apelidos, ativo: true });
      r.tipos++;
    });
  }
  return r;
}

/** Confere a planilha inteira numa cópia em memória: nada é gravado. */
export async function simularCadastrosFinanceiro(fin: Financeiro, cad: CadastrosFinanceiro) {
  const erros: ErroImportacao[] = [...cad.erros];
  const resumo = await importarCadastrosFinanceiro(await fin.copiaParaSimulacao(), cad, erros);
  return { resumo, erros };
}
