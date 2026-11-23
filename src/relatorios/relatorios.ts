import { formatarDataBR, type Periodo } from '../domain/datas';
import { gastosPorLocal, ordenarMovimentos, type Posicao } from '../domain/estoque';
import { formatarMoeda, formatarNumero } from '../domain/formato';
import { atrasado, diasDeAtraso, emprestimosAbertos } from '../domain/ferramentas';
import type { Emprestimo, Ferramenta, Funcionario, Item, Local, Movimento, TipoMovimento } from '../domain/tipos';

export type TipoColuna = 'texto' | 'numero' | 'moeda';
export interface Coluna { titulo: string; tipo: TipoColuna }
export type Celula = string | number;
/** Linha comum, ou subtítulo de grupo / subtotal (destacados no PDF e no Excel). */
export interface Linha { celulas: Celula[]; estilo?: 'grupo' | 'total' }

export interface Relatorio {
  titulo: string;
  subtitulo: string;
  colunas: Coluna[];
  linhas: Linha[];
  /** Nome do arquivo, sem extensão. */
  arquivo: string;
}

export const NOME_TIPO: Record<TipoMovimento, string> = {
  entrada: 'Entrada', saida: 'Saída', devolucao: 'Devolução', transferencia: 'Transferência', ajuste: 'Ajuste de inventário', epi: 'Entrega de EPI',
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const periodoTexto = (p: Periodo) => `${formatarDataBR(p.inicio)} a ${formatarDataBR(p.fim)}`;

export function relatorioSaldo(itens: Item[], posicao: Posicao, hoje: string): Relatorio {
  let total = 0;
  const linhas: Linha[] = itens.filter((i) => i.ativo).map((i) => {
    const s = posicao.itens[i.id];
    const q = s?.quantidade ?? 0;
    const v = r2(s?.valor ?? 0);
    total += v;
    const alerta = q <= i.estoqueMinimo && i.estoqueMinimo > 0 ? 'Abaixo do mínimo' : '';
    return { celulas: [i.nome, i.unidade, q, i.estoqueMinimo, q > 0 ? r2(v / q) : 0, v, alerta] };
  });
  linhas.push({ celulas: ['Total', '', '', '', '', r2(total), ''], estilo: 'total' });
  return {
    titulo: 'Saldo do estoque', subtitulo: `Posição em ${formatarDataBR(hoje)}`, arquivo: `Saldo_estoque_${hoje}`,
    colunas: [
      { titulo: 'Item', tipo: 'texto' }, { titulo: 'Un.', tipo: 'texto' }, { titulo: 'Saldo', tipo: 'numero' },
      { titulo: 'Mínimo', tipo: 'numero' }, { titulo: 'Custo médio', tipo: 'moeda' }, { titulo: 'Valor', tipo: 'moeda' }, { titulo: 'Situação', tipo: 'texto' },
    ],
    linhas,
  };
}

/** Material (quantidade e R$) destinado a cada frente, agrupado por centro de custo (contrato). */
export function relatorioGastos(movs: Movimento[], itens: Item[], locais: Local[], posicao: Posicao, periodo: Periodo): Relatorio {
  const item = new Map(itens.map((i) => [i.id, i]));
  const local = new Map(locais.map((l) => [l.id, l]));
  const gastos = gastosPorLocal(movs, posicao, periodo).filter((g) => Math.abs(g.quantidade) > 1e-9 || Math.abs(g.valor) > 0.004);
  const porCentro = new Map<string, Map<string, typeof gastos>>();
  for (const g of gastos) {
    const l = local.get(g.localId);
    const centro = l?.centroCusto ?? 'Sem centro de custo';
    const frente = l?.nome ?? 'Frente removida';
    const c = porCentro.get(centro) ?? new Map();
    c.set(frente, [...(c.get(frente) ?? []), g]);
    porCentro.set(centro, c);
  }
  const linhas: Linha[] = [];
  let geral = 0;
  for (const centro of [...porCentro.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
    linhas.push({ celulas: [centro, '', '', '', ''], estilo: 'grupo' });
    let totalCentro = 0;
    const frentes = porCentro.get(centro)!;
    for (const frente of [...frentes.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
      const lista = frentes.get(frente)!.sort((a, b) => (item.get(a.itemId)?.nome ?? '').localeCompare(item.get(b.itemId)?.nome ?? '', 'pt-BR'));
      for (const g of lista) {
        const i = item.get(g.itemId);
        linhas.push({ celulas: [frente, i?.nome ?? g.itemId, i?.unidade ?? '', g.quantidade, g.valor] });
        totalCentro += g.valor;
      }
    }
    linhas.push({ celulas: [`Total ${centro}`, '', '', '', r2(totalCentro)], estilo: 'total' });
    geral += totalCentro;
  }
  linhas.push({ celulas: ['Total geral', '', '', '', r2(geral)], estilo: 'total' });
  return {
    titulo: 'Material destinado por centro de custo', subtitulo: `Período: ${periodoTexto(periodo)} — saídas, menos devoluções, com transferências entre frentes`,
    arquivo: `Gastos_por_obra_${periodo.inicio}_a_${periodo.fim}`,
    colunas: [
      { titulo: 'Frente de serviço', tipo: 'texto' }, { titulo: 'Item', tipo: 'texto' }, { titulo: 'Un.', tipo: 'texto' },
      { titulo: 'Quantidade', tipo: 'numero' }, { titulo: 'Valor', tipo: 'moeda' },
    ],
    linhas,
  };
}

/** Histórico (ficha) de um item no período, com o saldo do galpão após cada lançamento. */
export function relatorioHistorico(
  it: Item, movs: Movimento[], locais: Local[], funcionarios: Funcionario[], posicao: Posicao, periodo: Periodo,
): Relatorio {
  const local = new Map(locais.map((l) => [l.id, l.nome]));
  const func = new Map(funcionarios.map((f) => [f.id, f.nome]));
  const doItem = ordenarMovimentos(movs.filter((m) => m.itemId === it.id && !m.cancelado));
  const anteriores = doItem.filter((m) => m.data < periodo.inicio);
  const saldoInicial = anteriores.length ? posicao.saldoApos[anteriores[anteriores.length - 1].id] ?? 0 : 0;
  const linhas: Linha[] = [{ celulas: [formatarDataBR(periodo.inicio), 'Saldo anterior', '', '', '', '', saldoInicial], estilo: 'grupo' }];
  for (const m of doItem.filter((x) => x.data >= periodo.inicio && x.data <= periodo.fim)) {
    const sinal = m.tipo === 'saida' || m.tipo === 'epi' ? -1 : m.tipo === 'transferencia' ? 0 : 1;
    const q = m.tipo === 'ajuste' ? m.quantidade : m.quantidade * sinal;
    let detalhe = '';
    if (m.tipo === 'entrada') detalhe = [m.fornecedor, m.notaFiscal && `NF ${m.notaFiscal}`].filter(Boolean).join(' · ');
    else if (m.tipo === 'saida') detalhe = [local.get(m.localId ?? ''), m.funcionarioId && `retirou: ${func.get(m.funcionarioId) ?? ''}`].filter(Boolean).join(' · ');
    else if (m.tipo === 'epi') detalhe = [`entregue a ${func.get(m.funcionarioId ?? '') ?? ''}`, m.ca && `CA ${m.ca}`, m.tamanho && `tam. ${m.tamanho}`].filter(Boolean).join(' · ');
    else if (m.tipo === 'devolucao') detalhe = `de ${local.get(m.localId ?? '') ?? ''}`;
    else if (m.tipo === 'transferencia') detalhe = `${local.get(m.localId ?? '') ?? ''} → ${local.get(m.localDestinoId ?? '') ?? ''}`;
    else detalhe = m.observacao ?? '';
    const c = posicao.custos[m.id];
    linhas.push({ celulas: [formatarDataBR(m.data), NOME_TIPO[m.tipo], detalhe, q, r2(c?.custoUnitario ?? 0), r2(c?.valor ?? 0), posicao.saldoApos[m.id] ?? 0] });
  }
  return {
    titulo: `Histórico — ${it.nome}`, subtitulo: `Período: ${periodoTexto(periodo)} · unidade: ${it.unidade}`,
    arquivo: `Historico_${it.nome.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)}_${periodo.inicio}_a_${periodo.fim}`,
    colunas: [
      { titulo: 'Data', tipo: 'texto' }, { titulo: 'Tipo', tipo: 'texto' }, { titulo: 'Detalhe', tipo: 'texto' },
      { titulo: 'Quantidade', tipo: 'numero' }, { titulo: 'Custo unit.', tipo: 'moeda' }, { titulo: 'Valor', tipo: 'moeda' }, { titulo: 'Saldo', tipo: 'numero' },
    ],
    linhas,
  };
}

/** Ferramentas que estão fora do galpão, com quem, desde quando e se estão atrasadas. */
export function relatorioFerramentasFora(
  ferramentas: Ferramenta[], emprestimos: Emprestimo[], funcionarios: Funcionario[], locais: Local[], hoje: string,
): Relatorio {
  const ferr = new Map(ferramentas.map((f) => [f.id, f]));
  const func = new Map(funcionarios.map((f) => [f.id, f.nome]));
  const local = new Map(locais.map((l) => [l.id, l.nome]));
  const abertos = emprestimosAbertos(emprestimos).sort((a, b) => a.prevista.localeCompare(b.prevista) || a.saida.localeCompare(b.saida));
  const linhas: Linha[] = abertos.map((e) => {
    const f = ferr.get(e.ferramentaId);
    const dias = diasDeAtraso(e, hoje);
    return {
      celulas: [
        f ? `${f.nome}${f.codigo ? ` ${f.codigo}` : ''}` : 'Ferramenta removida', func.get(e.funcionarioId) ?? '', local.get(e.localId ?? '') ?? '',
        formatarDataBR(e.saida), formatarDataBR(e.prevista), atrasado(e, hoje) ? `Atrasada ${dias} ${dias === 1 ? 'dia' : 'dias'}` : 'No prazo',
      ],
    };
  });
  return {
    titulo: 'Ferramentas fora do galpão', subtitulo: `Posição em ${formatarDataBR(hoje)} — ${abertos.length} ${abertos.length === 1 ? 'ferramenta' : 'ferramentas'}`,
    arquivo: `Ferramentas_fora_${hoje}`,
    colunas: [
      { titulo: 'Ferramenta', tipo: 'texto' }, { titulo: 'Com', tipo: 'texto' }, { titulo: 'Frente de serviço', tipo: 'texto' },
      { titulo: 'Saída', tipo: 'texto' }, { titulo: 'Devolução prevista', tipo: 'texto' }, { titulo: 'Situação', tipo: 'texto' },
    ],
    linhas,
  };
}

/** Ficha de EPI: o que cada funcionário recebeu no período, com CA, tamanho e data de troca. */
export function relatorioEpi(movs: Movimento[], itens: Item[], funcionarios: Funcionario[], periodo: Periodo, funcionarioId?: string): Relatorio {
  const item = new Map(itens.map((i) => [i.id, i]));
  const entregas = ordenarMovimentos(movs.filter((m) => m.tipo === 'epi' && !m.cancelado && m.data >= periodo.inicio && m.data <= periodo.fim
    && (!funcionarioId || m.funcionarioId === funcionarioId)));
  const porFuncionario = new Map<string, Movimento[]>();
  for (const m of entregas) porFuncionario.set(m.funcionarioId ?? '', [...(porFuncionario.get(m.funcionarioId ?? '') ?? []), m]);
  const nome = (id: string) => funcionarios.find((f) => f.id === id)?.nome ?? 'Funcionário removido';
  const linhas: Linha[] = [];
  for (const id of [...porFuncionario.keys()].sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR'))) {
    linhas.push({ celulas: [nome(id), '', '', '', '', ''], estilo: 'grupo' });
    for (const m of porFuncionario.get(id)!) {
      const i = item.get(m.itemId);
      linhas.push({ celulas: [formatarDataBR(m.data), i?.nome ?? m.itemId, m.quantidade, m.ca ?? '', m.tamanho ?? '', m.validade ? formatarDataBR(m.validade) : ''] });
    }
  }
  return {
    titulo: 'Entrega de EPI por funcionário',
    subtitulo: `Período: ${periodoTexto(periodo)}${funcionarioId ? ` — ${nome(funcionarioId)}` : ''}`,
    arquivo: `EPI_${periodo.inicio}_a_${periodo.fim}`,
    colunas: [
      { titulo: 'Data', tipo: 'texto' }, { titulo: 'EPI', tipo: 'texto' }, { titulo: 'Qtd.', tipo: 'numero' },
      { titulo: 'CA', tipo: 'texto' }, { titulo: 'Tamanho', tipo: 'texto' }, { titulo: 'Trocar em', tipo: 'texto' },
    ],
    linhas,
  };
}

// ---------- PDF (HTML) ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function celulaTexto(c: Celula, tipo: TipoColuna): string {
  if (typeof c === 'string') return c;
  return tipo === 'moeda' ? formatarMoeda(c) : formatarNumero(c);
}

export function relatorioHtml(r: Relatorio, emitidoEm: string): string {
  const cab = r.colunas.map((c) => `<th class="${c.tipo}">${esc(c.titulo)}</th>`).join('');
  const corpo = r.linhas.map((l) => `<tr class="${l.estilo ?? ''}">${l.celulas.map((c, i) =>
    `<td class="${r.colunas[i].tipo}">${esc(c === '' ? '' : celulaTexto(c, r.colunas[i].tipo))}</td>`).join('')}</tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { margin: 14mm 12mm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 10px; color: #1c1c1e; }
h1 { font-size: 15px; margin: 0 0 2px; } p { margin: 0 0 10px; color: #555; }
table { width: 100%; border-collapse: collapse; }
th { background: #2b2b2b; color: #fff; text-align: left; padding: 5px 6px; font-weight: 600; }
td { padding: 4px 6px; border-bottom: 1px solid #e2e4e8; vertical-align: top; }
th.numero, th.moeda, td.numero, td.moeda { text-align: right; white-space: nowrap; }
tr.grupo td { background: #e6eff6; font-weight: 700; }
tr.total td { font-weight: 700; border-top: 1.5px solid #2b2b2b; }
.rodape { margin-top: 10px; color: #888; font-size: 9px; }
</style></head><body><h1>${esc(r.titulo)}</h1><p>${esc(r.subtitulo)}</p>
<table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table>
<div class="rodape">Emitido em ${esc(emitidoEm)}</div></body></html>`;
}
