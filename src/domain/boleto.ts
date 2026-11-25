import { adicionarDias } from './datas';

/** Leitura da linha digitável (47 ou 48 dígitos) ou do código de barras (44) de boletos de cobrança e de convênios. */
export interface BoletoLido {
  tipo: 'cobranca' | 'convenio';
  /** 44 dígitos. */
  codigoBarras: string;
  valor?: number;
  vencimento?: string;
  /** Código do banco (cobrança). */
  banco?: string;
}

const soDigitos = (s: string) => s.replace(/\D/g, '');

function mod10(n: string): number {
  let soma = 0; let peso = 2;
  for (let i = n.length - 1; i >= 0; i--) {
    const x = Number(n[i]) * peso;
    soma += Math.floor(x / 10) + (x % 10);
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

function mod11Cobranca(n: string): number {
  let soma = 0; let peso = 2;
  for (let i = n.length - 1; i >= 0; i--) { soma += Number(n[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const dv = 11 - (soma % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

function mod11Convenio(n: string): number {
  let soma = 0; let peso = 2;
  for (let i = n.length - 1; i >= 0; i--) { soma += Number(n[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  return resto === 0 || resto === 1 ? 0 : resto === 10 ? 1 : 11 - resto;
}

/** O fator de vencimento recomeçou em 1000 em 22/02/2025: escolhe o ciclo cuja data fica mais perto de hoje. */
export function vencimentoDoFator(fator: number, hoje: string): string | undefined {
  if (fator === 0) return undefined;
  const antigo = adicionarDias('1997-10-07', fator);
  const novo = adicionarDias(antigo, 9000);
  const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
  return dias(antigo, hoje) <= dias(novo, hoje) ? antigo : novo;
}

/**
 * Aceita linha digitável (com pontos e espaços) ou código de barras. Confere os dígitos verificadores:
 * erro de digitação é recusado em vez de gerar um pagamento errado.
 */
export function lerBoleto(texto: string, hoje: string): BoletoLido {
  const n = soDigitos(texto);
  const invalido = () => new Error('Boleto inválido: confira os números (linha digitável de 47 ou 48 dígitos, ou código de barras de 44)');

  if (n.length === 44) return lerBarras(n, hoje, invalido);
  if (n.length === 47) {
    const c1 = n.slice(0, 9); const c2 = n.slice(10, 20); const c3 = n.slice(21, 31);
    if (mod10(c1) !== Number(n[9]) || mod10(c2) !== Number(n[20]) || mod10(c3) !== Number(n[31])) throw invalido();
    const barras = n.slice(0, 4) + n[32] + n.slice(33, 47) + n.slice(4, 9) + n.slice(10, 20) + n.slice(21, 31);
    return lerBarras(barras, hoje, invalido);
  }
  if (n.length === 48 && n[0] === '8') {
    const blocos = [0, 12, 24, 36].map((i) => n.slice(i, i + 12));
    const modulo11 = n[2] === '8' || n[2] === '9';
    for (const b of blocos) {
      const dv = modulo11 ? mod11Convenio(b.slice(0, 11)) : mod10(b.slice(0, 11));
      if (dv !== Number(b[11])) throw invalido();
    }
    return lerBarras(blocos.map((b) => b.slice(0, 11)).join(''), hoje, invalido);
  }
  throw invalido();
}

function lerBarras(n: string, hoje: string, invalido: () => Error): BoletoLido {
  if (n[0] === '8') {
    // convênio/arrecadação: 3º dígito 6 ou 7 = valor real; 8 ou 9 = valor de referência
    const modulo11 = n[2] === '8' || n[2] === '9';
    const dv = modulo11 ? mod11Convenio(n.slice(0, 3) + n.slice(4)) : mod10(n.slice(0, 3) + n.slice(4));
    if (dv !== Number(n[3])) throw invalido();
    const efetivo = n[2] === '6' || n[2] === '7';
    const cent = Number(n.slice(4, 15));
    return { tipo: 'convenio', codigoBarras: n, ...(efetivo && cent > 0 ? { valor: cent / 100 } : {}) };
  }
  if (mod11Cobranca(n.slice(0, 4) + n.slice(5)) !== Number(n[4])) throw invalido();
  const fator = Number(n.slice(5, 9));
  const cent = Number(n.slice(9, 19));
  const vencimento = vencimentoDoFator(fator, hoje);
  return { tipo: 'cobranca', codigoBarras: n, banco: n.slice(0, 3), ...(cent > 0 ? { valor: cent / 100 } : {}), ...(vencimento ? { vencimento } : {}) };
}
