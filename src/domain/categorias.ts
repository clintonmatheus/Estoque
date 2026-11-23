import type { Item } from './tipos';

export const CATEGORIAS = ['Pintura', 'Elétrica', 'Hidráulica e louças', 'Ferragens', 'Revestimentos e acabamento', 'Outros'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

// A ordem importa: "CABO PRA ROLO" é pintura (rolo), não elétrica (cabo).
const REGRAS: [Categoria, RegExp][] = [
  ['Pintura', /\b(TINTAS?|MASSA|SELADOR|SELA E PINTA|SOLVENTE|THINNER|ROLO|TRINCHA|BROXA|ESPATULA|FITA CREPE|LIXA|DELANIL|DIALINE|DIAPISO|DIATEX|ESMALTE|VERNIZ|TEXTURA|GRAFIATO|FUNDO PREPARADOR|ZARCAO)\b/],
  ['Elétrica', /\b(LAMPADA|LUMINARIA|REFLETOR|TOMADA|INTERRUPTOR|DISJUNTOR|FIO|CABO FLEX|CABO PP|ELETRODUTO|QUADRO|SPOT|PLAFON|FITA ISOLANTE|REATOR)\b/],
  ['Hidráulica e louças', /\b(TORNEIRA|VASO|REGISTRO|SIFAO|TUBO|CONEXAO|JOELHO|LUVA|PIA|LAVATORIO|CUBA|CHUVEIRO|DUCHA|VALVULA|ENGATE|CAIXA D.AGUA|MICTORIO|ASSENTO)\b/],
  ['Ferragens', /\b(FECHADURA|PREGO|PARAFUSO|BUCHA|DOBRADICA|PUXADOR|MACANETA|CADEADO|ARRUELA|PORCA|ARAME|ROLDANA|TRINCO|FERROLHO)\b/],
  ['Revestimentos e acabamento', /\b(REVESTIMENTO|REJUNTE|ARGAMASSA|PORCELANATO|PISO|AZULEJO|PASTILHA|RODAPE|SOLEIRA|PEITORIL|PLACA|FORRO|GESSO|DRYWALL|IMPERMEABILIZANTE)\b/],
];

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Sugere a categoria pelo nome do item. */
export function inferirCategoria(nome: string): Categoria {
  const n = normalizar(nome);
  return REGRAS.find(([, r]) => r.test(n))?.[0] ?? 'Outros';
}

/** Categoria escolhida no cadastro ou, se não houver, a sugerida pelo nome. */
export function categoriaDoItem(item: Pick<Item, 'nome'> & { categoria?: string }): string {
  return item.categoria || inferirCategoria(item.nome);
}
