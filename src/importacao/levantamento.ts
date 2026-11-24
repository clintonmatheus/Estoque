import { dataDaCelula, type Abas, type Celula } from './lerXlsx';

/** Abas e cabeçalhos da planilha de levantamento (modelos/Levantamento_Estoque.xlsx). */
export const ABAS = {
  frentes: { nome: 'Frentes de serviço', colunas: ['Frente de serviço', 'Centro de custo (contrato)'] },
  funcionarios: { nome: 'Funcionários', colunas: ['Nome'] },
  materiais: { nome: 'Materiais', colunas: ['Item', 'Unidade', 'Categoria', 'Estoque mínimo', 'Quantidade no galpão', 'Custo unitário (R$)'] },
  equipamentos: {
    nome: 'Equipamentos',
    colunas: ['Nome', 'Código', 'Tipo', 'Controle', 'Quantidade', 'Onde está', 'Com quem', 'Frente de serviço', 'Devolver até', 'Locadora',
      'Nº do contrato', 'Valor por peça (R$)', 'Período', 'Início da locação', 'Fim previsto', 'Obra cobrada', 'Observação'],
  },
} as const;

export interface ErroImportacao { aba: string; linha: number; mensagem: string }

export interface LinhaFrente { linha: number; nome: string; centroCusto: string }
export interface LinhaFuncionario { linha: number; nome: string }
export interface LinhaMaterial { linha: number; nome: string; unidade?: string; categoria?: string; minimo?: number; quantidade?: number; custo?: number }
/** Onde estão as peças (nomes como escritos na planilha; o app procura o cadastro depois). */
export interface LinhaPosse { linha: number; quantidade: number; ondeObra: boolean; funcionario?: string; frente?: string; prevista?: string }
export interface GrupoEquipamento {
  linhas: number[]; nome: string; codigo?: string; tipo: 'ferramenta' | 'locado'; controle: 'unidade' | 'quantidade'; observacao?: string;
  locacao?: { locadora: string; contrato?: string; valor?: number; periodo?: 'dia' | 'mes'; inicio?: string; prevista?: string; obraCobrada?: string };
  posses: LinhaPosse[];
}
export interface Levantamento {
  frentes: LinhaFrente[]; funcionarios: LinhaFuncionario[]; materiais: LinhaMaterial[]; equipamentos: GrupoEquipamento[]; erros: ErroImportacao[];
}

/** Compara nomes sem diferença de maiúsculas, acentos e espaços extras. */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

const texto = (c: Celula) => (c === undefined ? undefined : String(c).trim() || undefined);

function numero(c: Celula): number | undefined {
  if (c === undefined) return undefined;
  if (typeof c === 'number') return c;
  let t = String(c).trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
  if (!t) return undefined;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`Número inválido: ${String(c)}`);
  return Number(t);
}

/** Lê as linhas de uma aba pelos cabeçalhos (a ordem das colunas pode mudar). */
function linhasDaAba(abas: Abas, aba: { nome: string; colunas: readonly string[] }, erros: ErroImportacao[]) {
  const chave = Object.keys(abas).find((k) => normalizar(k) === normalizar(aba.nome));
  if (!chave) return [];
  const linhas = abas[chave];
  const iCab = linhas.findIndex((l) => l?.some((c) => typeof c === 'string' && normalizar(c) === normalizar(aba.colunas[0])));
  if (iCab < 0) { erros.push({ aba: aba.nome, linha: 1, mensagem: `Cabeçalho "${aba.colunas[0]}" não encontrado` }); return []; }
  const pos = new Map<string, number>();
  linhas[iCab].forEach((c, i) => { if (typeof c === 'string') pos.set(normalizar(c), i); });
  const faltando = aba.colunas.filter((c) => !pos.has(normalizar(c)));
  if (faltando.length) { erros.push({ aba: aba.nome, linha: iCab + 1, mensagem: `Faltam as colunas: ${faltando.join(', ')}` }); return []; }
  const saida: { linha: number; v: (coluna: string) => Celula }[] = [];
  for (let i = iCab + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (!l || !l.some((c) => c !== undefined)) continue;
    saida.push({ linha: i + 1, v: (coluna) => l[pos.get(normalizar(coluna))!] });
  }
  return saida;
}

function opcao<T extends string>(c: Celula, valores: Record<string, T>, campo: string): T | undefined {
  const t = texto(c);
  if (!t) return undefined;
  const v = valores[normalizar(t)];
  if (!v) throw new Error(`${campo} inválido: "${t}" (use ${Object.keys(valores).join(' ou ')})`);
  return v;
}

/** Interpreta a planilha e confere o formato de cada linha. Nomes de funcionários e frentes são conferidos depois, no app. */
export function lerLevantamento(abas: Abas): Levantamento {
  const r: Levantamento = { frentes: [], funcionarios: [], materiais: [], equipamentos: [], erros: [] };
  const cada = <T>(aba: { nome: string; colunas: readonly string[] }, f: (v: (c: string) => Celula, linha: number) => T | undefined, destino: T[]) => {
    for (const { linha, v } of linhasDaAba(abas, aba, r.erros)) {
      try { const x = f(v, linha); if (x) destino.push(x); } catch (e) { r.erros.push({ aba: aba.nome, linha, mensagem: (e as Error).message }); }
    }
  };

  cada(ABAS.frentes, (v, linha) => {
    const nome = texto(v('Frente de serviço'));
    const centroCusto = texto(v('Centro de custo (contrato)'));
    if (!nome) throw new Error('Informe o nome da frente de serviço');
    if (!centroCusto) throw new Error('Informe o centro de custo (contrato)');
    return { linha, nome, centroCusto };
  }, r.frentes);

  cada(ABAS.funcionarios, (v, linha) => {
    const nome = texto(v('Nome'));
    return nome ? { linha, nome } : undefined;
  }, r.funcionarios);

  cada(ABAS.materiais, (v, linha) => {
    const nome = texto(v('Item'));
    if (!nome) throw new Error('Informe o nome do item');
    const m: LinhaMaterial = { linha, nome };
    const unidade = texto(v('Unidade')); if (unidade) m.unidade = unidade;
    const categoria = texto(v('Categoria')); if (categoria) m.categoria = categoria;
    const minimo = numero(v('Estoque mínimo'));
    if (minimo !== undefined) { if (minimo < 0) throw new Error('Estoque mínimo não pode ser negativo'); m.minimo = minimo; }
    const qtd = numero(v('Quantidade no galpão'));
    if (qtd !== undefined && qtd !== 0) {
      if (qtd < 0) throw new Error('Quantidade não pode ser negativa');
      const custo = numero(v('Custo unitário (R$)'));
      if (custo === undefined || custo < 0) throw new Error('Informe o custo unitário (é usado no custo PEPS)');
      m.quantidade = qtd; m.custo = custo;
    }
    return m;
  }, r.materiais);

  const grupos = new Map<string, GrupoEquipamento>();
  cada(ABAS.equipamentos, (v, linha) => {
    const nome = texto(v('Nome'));
    if (!nome) throw new Error('Informe o nome');
    const codigo = texto(v('Código'));
    const tipo = opcao(v('Tipo'), { ferramenta: 'ferramenta', locado: 'locado' } as const, 'Tipo');
    if (!tipo) throw new Error('Informe o tipo (Ferramenta ou Locado)');
    const controle = opcao(v('Controle'), { individual: 'unidade', quantidade: 'quantidade' } as const, 'Controle');
    if (!controle) throw new Error('Informe o controle (Individual ou Quantidade)');
    const qtdBruta = numero(v('Quantidade'));
    const quantidade = controle === 'unidade' ? (qtdBruta ?? 1) : qtdBruta;
    if (controle === 'unidade' && quantidade !== 1) throw new Error('Individual: uma linha por unidade (quantidade 1), com códigos diferentes');
    if (!quantidade || quantidade <= 0 || !Number.isInteger(quantidade)) throw new Error('Informe a quantidade de peças (número inteiro)');
    const onde = opcao(v('Onde está'), { galpao: 'galpao', obra: 'obra' } as const, 'Onde está') ?? 'galpao';
    const posse: LinhaPosse = { linha, quantidade, ondeObra: onde === 'obra' };
    if (posse.ondeObra) {
      posse.funcionario = texto(v('Com quem'));
      posse.frente = texto(v('Frente de serviço'));
      if (!posse.funcionario || !posse.frente) throw new Error('Em obra: informe Com quem e a Frente de serviço');
      const prevista = dataDaCelula(v('Devolver até'));
      if (prevista) posse.prevista = prevista;
    }
    const chave = `${normalizar(nome)}|${normalizar(codigo ?? '')}`;
    const existente = grupos.get(chave);
    if (existente) {
      if (existente.controle === 'unidade' || controle === 'unidade') throw new Error(`${nome}${codigo ? ` ${codigo}` : ''} repetido: individuais precisam de códigos diferentes`);
      if (existente.tipo !== tipo) throw new Error('Tipo diferente da primeira linha deste equipamento');
      existente.linhas.push(linha); existente.posses.push(posse);
      return undefined;
    }
    const g: GrupoEquipamento = { linhas: [linha], nome, tipo, controle, posses: [posse] };
    if (codigo) g.codigo = codigo;
    const obs = texto(v('Observação')); if (obs) g.observacao = obs;
    if (tipo === 'locado') {
      const locadora = texto(v('Locadora'));
      if (!locadora) throw new Error('Locado: informe a locadora');
      g.locacao = { locadora };
      const contrato = texto(v('Nº do contrato')); if (contrato) g.locacao.contrato = contrato;
      const valor = numero(v('Valor por peça (R$)'));
      if (valor !== undefined) {
        g.locacao.valor = valor;
        g.locacao.periodo = opcao(v('Período'), { dia: 'dia', mes: 'mes' } as const, 'Período') ?? 'mes';
      }
      const inicio = dataDaCelula(v('Início da locação')); if (inicio) g.locacao.inicio = inicio;
      const fim = dataDaCelula(v('Fim previsto')); if (fim) g.locacao.prevista = fim;
      const cobrada = texto(v('Obra cobrada')); if (cobrada) g.locacao.obraCobrada = cobrada;
    }
    grupos.set(chave, g);
    return g;
  }, r.equipamentos);
  return r;
}
