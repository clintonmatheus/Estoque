import type { Item } from './tipos';

export function paraUnidadeBase(item: Item, quantidade: number, emEmbalagem: boolean): number {
  return emEmbalagem && item.embalagem ? quantidade * item.embalagem.fator : quantidade;
}


export function formatarNumero(n: number): string {
  // Intl pode faltar no Hermes antigo: formata manualmente.
  const neg = n < 0;
  const [int, dec] = String(Math.round(Math.abs(n) * 1000) / 1000).split('.');
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${milhar}${dec ? `,${dec}` : ''}`;
}

export function formatarQuantidade(item: Pick<Item, 'unidade' | 'embalagem'>, q: number): string {
  const base = `${formatarNumero(q)} ${item.unidade}`;
  const e = item.embalagem;
  if (!e || q < e.fator || !Number.isInteger(q)) return base;
  const cx = Math.floor(q / e.fator);
  const resto = q - cx * e.fator;
  return `${base} (${cx} ${e.nome}${resto ? ` + ${resto} ${item.unidade}` : ''})`;
}

export function formatarMoeda(v: number): string {
  const neg = v < 0;
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  return `${neg ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

/** Aceita "1,5", "1.234,56" e "52.00". */
export function lerNumero(texto: string): number | undefined {
  let t = texto.trim().replace(/\s/g, '');
  if (!t) return undefined;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}
