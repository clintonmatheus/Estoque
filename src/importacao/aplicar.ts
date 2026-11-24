import type { Estoque } from '../dados/estoque';
import type { Posse } from '../domain/tipos';
import { ABAS, normalizar, type ErroImportacao, type Levantamento } from './levantamento';

export interface ResumoImportacao {
  frentes: number; funcionarios: number; itensNovos: number; itensAtualizados: number; itensComSaldo: number;
  equipamentos: number; movimentacoes: number;
}

export const FORNECEDOR_LEVANTAMENTO = 'Saldo inicial (levantamento)';

/**
 * Grava o levantamento no app. Com `erros`, não para no primeiro problema: anota e segue (usado na simulação).
 * Sem `erros`, qualquer problema interrompe com a aba e a linha na mensagem.
 */
export async function importarLevantamento(estoque: Estoque, lev: Levantamento, data: string, erros?: ErroImportacao[]): Promise<ResumoImportacao> {
  const resumo: ResumoImportacao = { frentes: 0, funcionarios: 0, itensNovos: 0, itensAtualizados: 0, itensComSaldo: 0, equipamentos: 0, movimentacoes: 0 };
  const falha = (aba: string, linha: number, e: unknown) => {
    const mensagem = (e as Error).message;
    if (!erros) throw new Error(`${aba}, linha ${linha}: ${mensagem}`);
    erros.push({ aba, linha, mensagem });
  };

  // 1. Frentes de serviço
  const locais = new Map((await estoque.locais(true)).map((l) => [normalizar(l.nome), l]));
  for (const f of lev.frentes) {
    if (locais.has(normalizar(f.nome))) continue;
    try { locais.set(normalizar(f.nome), await estoque.salvarLocal({ nome: f.nome, centroCusto: f.centroCusto, ativo: true })); resumo.frentes++; }
    catch (e) { falha(ABAS.frentes.nome, f.linha, e); }
  }

  // 2. Funcionários
  const funcs = new Map((await estoque.funcionarios(true)).map((f) => [normalizar(f.nome), f]));
  for (const f of lev.funcionarios) {
    if (funcs.has(normalizar(f.nome))) continue;
    try { funcs.set(normalizar(f.nome), await estoque.salvarFuncionario({ nome: f.nome, ativo: true })); resumo.funcionarios++; }
    catch (e) { falha(ABAS.funcionarios.nome, f.linha, e); }
  }

  // 3. Materiais: cadastro e saldo inicial (uma entrada única, custo informado)
  const itens = new Map((await estoque.itens(true)).map((i) => [normalizar(i.nome), i]));
  const posicao = await estoque.posicao();
  const vistos = new Set<string>();
  const linhasEntrada: { itemId: string; quantidade: number; custoUnitario: number }[] = [];
  let primeiraLinha = 0;
  for (const m of lev.materiais) {
    try {
      const k = normalizar(m.nome);
      if (vistos.has(k)) throw new Error('Item repetido na planilha');
      vistos.add(k);
      let item = itens.get(k);
      if (!item) {
        if (!m.unidade) throw new Error('Item novo: informe a unidade');
        item = await estoque.salvarItem({
          nome: m.nome, unidade: m.unidade, estoqueMinimo: m.minimo ?? 0, ativo: true,
          ...(m.categoria ? { categoria: m.categoria } : {}), ...(m.custo !== undefined ? { custoReferencia: m.custo } : {}),
        });
        itens.set(k, item);
        resumo.itensNovos++;
      } else if ((m.minimo !== undefined && m.minimo !== item.estoqueMinimo) || (m.categoria && m.categoria !== item.categoria)) {
        item = await estoque.salvarItem({ ...item, ...(m.minimo !== undefined ? { estoqueMinimo: m.minimo } : {}), ...(m.categoria ? { categoria: m.categoria } : {}) });
        resumo.itensAtualizados++;
      }
      if (m.quantidade) {
        const saldo = posicao.itens[item.id]?.quantidade ?? 0;
        if (saldo > 0) throw new Error(`${item.nome} já tem saldo no app (${saldo} ${item.unidade}); para corrigir use o Inventário`);
        linhasEntrada.push({ itemId: item.id, quantidade: m.quantidade, custoUnitario: m.custo ?? 0 });
        if (!primeiraLinha) primeiraLinha = m.linha;
      }
    } catch (e) { falha(ABAS.materiais.nome, m.linha, e); }
  }
  if (linhasEntrada.length) {
    try {
      await estoque.lancar({ tipo: 'entrada', data, fornecedor: FORNECEDOR_LEVANTAMENTO, observacao: 'Importado da planilha de levantamento', linhas: linhasEntrada });
      resumo.itensComSaldo = linhasEntrada.length;
    } catch (e) { falha(ABAS.materiais.nome, primeiraLinha, e); }
  }

  // 4. Ferramentas e equipamentos locados
  const posse = (ondeObra: boolean, funcionario?: string, frente?: string): Posse => {
    if (!ondeObra) return { tipo: 'galpao' };
    const f = funcs.get(normalizar(funcionario ?? ''));
    if (!f) throw new Error(`Funcionário "${funcionario}" não encontrado (cadastre na aba Funcionários)`);
    const l = locais.get(normalizar(frente ?? ''));
    if (!l) throw new Error(`Frente de serviço "${frente}" não encontrada (cadastre na aba Frentes de serviço)`);
    return { tipo: 'campo', funcionarioId: f.id, localId: l.id };
  };
  for (const g of lev.equipamentos) {
    let bemId: string | undefined;
    for (const [i, p] of g.posses.entries()) {
      try {
        const onde = posse(p.ondeObra, p.funcionario, p.frente);
        if (i === 0) {
          const loc = g.locacao;
          let localCobrancaId: string | undefined;
          if (loc?.obraCobrada) {
            localCobrancaId = locais.get(normalizar(loc.obraCobrada))?.id;
            if (!localCobrancaId) throw new Error(`Obra cobrada "${loc.obraCobrada}" não encontrada (cadastre na aba Frentes de serviço)`);
          }
          const bem = await estoque.cadastrarBem({
            nome: g.nome, codigo: g.codigo, tipo: g.tipo, controle: g.controle, ativo: true, observacao: g.observacao,
            ...(loc ? { locacao: { locadora: loc.locadora, contrato: loc.contrato, valor: loc.valor, periodo: loc.periodo, inicio: loc.inicio, prevista: loc.prevista, localCobrancaId } } : {}),
          }, { posse: onde, quantidade: p.quantidade, data, prevista: p.prevista }).catch((e: Error) => {
            throw e.message === 'Já existe esse cadastro' ? new Error(`${g.nome}${g.codigo ? ` ${g.codigo}` : ''} já está cadastrado no app`) : e;
          });
          bemId = bem.id;
          resumo.equipamentos++;
        } else {
          if (!bemId) throw new Error('A primeira linha deste equipamento tem erro');
          await estoque.movimentarBem({ bemId, data, quantidade: p.quantidade, origem: { tipo: 'externo' }, destino: onde, observacao: 'Levantamento inicial' });
        }
        resumo.movimentacoes++;
      } catch (e) { falha(ABAS.equipamentos.nome, p.linha, e); }
    }
  }
  return resumo;
}

/** Faz a importação numa cópia dos dados: devolve o resumo do que seria gravado e todos os problemas, sem gravar nada. */
export async function simularImportacao(estoque: Estoque, lev: Levantamento, data: string): Promise<{ resumo: ResumoImportacao; erros: ErroImportacao[] }> {
  const erros: ErroImportacao[] = [...lev.erros];
  const copia = await estoque.copiaParaSimulacao();
  const resumo = await importarLevantamento(copia, lev, data, erros);
  return { resumo, erros };
}
