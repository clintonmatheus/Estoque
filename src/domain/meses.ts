/** Meses no formato AAAA-MM (competência). */

export const ehMes = (m?: string) => !!m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** "08/2026", "8/2026" ou "2026-08" → "2026-08". */
export function lerMes(s: string): string {
  const t = s.trim();
  const br = t.match(/^(\d{1,2})\/(\d{4})$/);
  const m = br ? `${br[2]}-${br[1].padStart(2, '0')}` : t;
  if (!ehMes(m)) throw new Error(`Mês inválido: ${t} (use mm/aaaa)`);
  return m;
}

export const formatarMes = (m?: string) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : '');

/** Percentual que vale no mês: a última vigência que começou até aquele mês. */
export function percentualNoMes(vigencias: { desde: string; percentual: number }[], mes: string): number | undefined {
  return [...vigencias].sort((a, b) => a.desde.localeCompare(b.desde)).filter((v) => v.desde <= mes).pop()?.percentual;
}

/** Custos fixos que valem no mês. */
export function fixosDoMes<T extends { inicio: string; fim?: string }>(lista: T[], mes: string): T[] {
  return lista.filter((c) => c.inicio <= mes && (!c.fim || mes <= c.fim));
}
