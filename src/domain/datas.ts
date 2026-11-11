/** Datas no formato ISO local "AAAA-MM-DD", sem depender do fuso do aparelho. */
const NOMES_DIA = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado',
];
const DIA_MS = 86_400_000;
const FUSO_NATAL_MIN = -180; // America/Sao_Paulo (UTC-03:00), sem horário de verão

export type InicioSemana = 'sabado' | 'segunda';

function parse(data: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) throw new Error('Data inválida');
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(ano, mes - 1, dia);
  const d = new Date(t);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    throw new Error('Data inválida');
  }
  return t;
}

function formatar(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function adicionarDias(data: string, dias: number): string {
  return formatar(parse(data) + dias * DIA_MS);
}

export function diaDaSemana(data: string): string {
  return NOMES_DIA[new Date(parse(data)).getUTCDay()];
}

export function periodoSemanal(data: string, inicio: InicioSemana): { inicio: string; fim: string } {
  const t = parse(data);
  const dow = new Date(t).getUTCDay(); // 0 = domingo
  const alvo = inicio === 'sabado' ? 6 : 1;
  const recuo = (dow - alvo + 7) % 7;
  const ini = t - recuo * DIA_MS;
  return { inicio: formatar(ini), fim: formatar(ini + 6 * DIA_MS) };
}

/** Converte um instante ISO (UTC) para a data local de Natal/RN. */
export function dataLocal(instante: string, offsetMin: number = FUSO_NATAL_MIN): string {
  const t = Date.parse(instante);
  if (Number.isNaN(t)) throw new Error('Data inválida');
  return formatar(t + offsetMin * 60_000);
}

/** "2026-11-05" → "05/11/2026" */
export function formatarDataBR(data: string): string {
  diaDaSemana(data); // valida
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}

/** Sábados e domingos são, por padrão, dias sem expediente. */
export function motivoPadraoSemExpediente(data: string): string | undefined {
  const d = diaDaSemana(data);
  return d === 'sábado' || d === 'domingo' ? 'Fim de semana' : undefined;
}

/** Primeiro e último dia do mês da data informada. */
export function periodoDoMes(data: string): { inicio: string; fim: string } {
  diaDaSemana(data); // valida
  const [a, m] = data.split('-').map(Number);
  const inicio = `${a}-${String(m).padStart(2, '0')}-01`;
  const proximo = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  return { inicio, fim: adicionarDias(proximo, -1) };
}

/** "27/06/2026" (ou "5/7/2026") → "2026-06-27". Lança 'Data inválida' se não existir. */
export function analisarDataBR(texto: string): string {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) throw new Error('Data inválida');
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso) throw new Error('Data inválida');
  return iso;
}

export interface Periodo { inicio: string; fim: string }

export function periodoMesAnterior(p: Periodo): Periodo {
  return periodoDoMes(adicionarDias(p.inicio, -1));
}

export function periodoMesSeguinte(p: Periodo): Periodo {
  return periodoDoMes(adicionarDias(p.fim, 1));
}

export function deslocarPeriodo(p: Periodo, dias: number): Periodo {
  return { inicio: adicionarDias(p.inicio, dias), fim: adicionarDias(p.fim, dias) };
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 0 = domingo … 6 = sábado. */
export function indiceDiaSemana(data: string): number {
  diaDaSemana(data); // valida
  return new Date(`${data}T00:00:00Z`).getUTCDay();
}

/** "2026-11-15" → "novembro de 2026" */
export function nomeDoMes(data: string): string {
  diaDaSemana(data); // valida
  const [a, m] = data.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

/** Instante ISO (UTC) → "HH:MM" no horário de Natal (UTC-3). */
export function horaLocal(instante: string, offsetMin = -180): string {
  const d = new Date(Date.parse(instante) + offsetMin * 60_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
