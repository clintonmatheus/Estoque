/** Regras para comparar nomes digitados de formas diferentes nas planilhas e para validar documentos. */

/** "RMG Água " e "rmg agua" viram a mesma chave: sem acento, maiúsculas, espaços únicos, sem plural final. */
export function chaveNome(s: string): string {
  const base = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  return base.replace(/(\w{3,})S$/, '$1');
}

/** Distância de edição (Levenshtein). */
function distancia(a: string, b: string): number {
  const linha = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return linha[b.length];
}

/** Semelhança de 0 a 1 entre dois nomes (1 = mesma chave). */
export function semelhanca(a: string, b: string): number {
  const x = chaveNome(a);
  const y = chaveNome(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - distancia(x, y) / Math.max(x.length, y.length);
}

export interface ComNomes { id: string; nome: string; apelidos?: string[] }

/** Cadastro cujo nome ou outro nome tem a mesma chave. */
export function acharPorNome<T extends ComNomes>(lista: T[], nome: string): T | undefined {
  const k = chaveNome(nome);
  return lista.find((x) => chaveNome(x.nome) === k || (x.apelidos ?? []).some((a) => chaveNome(a) === k));
}

/** Melhor candidato parecido (para sugerir a ligação), acima de um mínimo de semelhança. */
export function sugerirPorNome<T extends ComNomes>(lista: T[], nome: string, minimo = 0.75): T | undefined {
  let melhor: { x: T; s: number } | undefined;
  for (const x of lista) {
    const s = Math.max(semelhanca(x.nome, nome), ...(x.apelidos ?? []).map((a) => semelhanca(a, nome)));
    if (s >= minimo && (!melhor || s > melhor.s)) melhor = { x, s };
  }
  return melhor?.x;
}

/** Junta outros nomes, sem repetir chave nem repetir o nome principal. */
export function juntarApelidos(nome: string, ...listas: (string[] | undefined)[]): string[] {
  const vistos = new Set([chaveNome(nome)]);
  const saida: string[] = [];
  for (const a of listas.flat()) {
    const t = a?.trim();
    if (!t || vistos.has(chaveNome(t))) continue;
    vistos.add(chaveNome(t));
    saida.push(t);
  }
  return saida;
}

export const soNumeros = (s: string) => s.replace(/\D/g, '');

/** Cada lista de pesos confere o dígito que vem logo depois dos números que ela pesa (módulo 11). */
function digitosVerificam(n: string, pesos: number[][]): boolean {
  return pesos.every((p) => {
    const resto = p.reduce((t, peso, i) => t + Number(n[i]) * peso, 0) % 11;
    return Number(n[p.length]) === (resto < 2 ? 0 : 11 - resto);
  });
}

export function cpfValido(s: string): boolean {
  const n = soNumeros(s);
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;
  const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  return digitosVerificam(n, [p1, p2]);
}

export function cnpjValido(s: string): boolean {
  const n = soNumeros(s);
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false;
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return digitosVerificam(n, [p1, p2]);
}

/** CPF ou CNPJ válido, só números; lança erro se o número não confere. */
export function documentoValido(s: string): string {
  const n = soNumeros(s);
  if (n.length === 11 && cpfValido(n)) return n;
  if (n.length === 14 && cnpjValido(n)) return n;
  throw new Error(`CPF/CNPJ inválido: ${formatarDocumento(n) || s.trim()}`);
}

export function formatarDocumento(n?: string): string {
  if (!n) return '';
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return n;
}

export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

/** Identifica e normaliza a chave Pix; lança erro se não for de nenhum tipo. */
export function lerChavePix(s: string): { chave: string; tipo: TipoChavePix } {
  const t = s.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return { chave: t.toLowerCase(), tipo: 'email' };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return { chave: t.toLowerCase(), tipo: 'aleatoria' };
  const n = soNumeros(t);
  if (/^[\d.\-/\s]+$/.test(t)) {
    if (n.length === 14 && cnpjValido(n)) return { chave: n, tipo: 'cnpj' };
    if (n.length === 11 && cpfValido(n)) return { chave: n, tipo: 'cpf' };
  }
  if (/^\+?[\d\s()-]+$/.test(t) && (n.length === 10 || n.length === 11 || n.length === 12 || n.length === 13)) {
    return { chave: `+${n.length <= 11 ? `55${n}` : n}`, tipo: 'telefone' };
  }
  throw new Error(`Chave Pix inválida: ${t}`);
}

export const NOME_TIPO_CHAVE: Record<TipoChavePix, string> = { cpf: 'CPF', cnpj: 'CNPJ', email: 'e-mail', telefone: 'telefone', aleatoria: 'chave aleatória' };

/** Tipos de despesa iniciais (vistos nos caixas), com as grafias alternativas encontradas. */
export const TIPOS_DESPESA_INICIAIS: { nome: string; apelidos: string[] }[] = [
  { nome: 'Material', apelidos: [] },
  { nome: 'Material estoque', apelidos: [] },
  { nome: 'Serviço', apelidos: [] },
  { nome: 'Terceirizado', apelidos: [] },
  { nome: 'Salário', apelidos: ['Folha'] },
  { nome: 'Encargos', apelidos: ['Encargos da folha'] },
  { nome: 'Administrativo', apelidos: ['ADM'] },
  { nome: 'Combustível', apelidos: [] },
  { nome: 'Alimentação', apelidos: [] },
  { nome: 'Vale alimentação', apelidos: [] },
  { nome: 'Vale transporte', apelidos: [] },
  { nome: 'Alojamento', apelidos: [] },
  { nome: 'Locação de equipamento', apelidos: [] },
  { nome: 'Manutenção de veículo', apelidos: ['Manutenção veículo'] },
  { nome: 'Manutenção de equipamento', apelidos: ['Manutenção equipamento'] },
  { nome: 'Ferramenta', apelidos: [] },
  { nome: 'Transporte', apelidos: [] },
  { nome: 'Imposto', apelidos: [] },
  { nome: 'Despesa geral', apelidos: [] },
  { nome: 'Outros', apelidos: [] },
];

/** Encargos iniciais: os percentuais da planilha de presença (editáveis; cada mudança vale a partir de um mês). */
export const ENCARGOS_INICIAIS: { nome: string; descricao: string; percentual: number }[] = [
  { nome: 'Encargos da folha', descricao: 'Percentual geral da planilha de presença (serventes, profissionais, produção e salários fixos)', percentual: 37.77 },
  { nome: 'Encargos especiais', descricao: 'Percentual maior usado em caso individual na planilha de presença', percentual: 67.05 },
];
