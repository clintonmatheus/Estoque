import { StyleSheet } from 'react-native';

/** Tema "Grafite + Azul aço": grafite da marca Grupo Passos com azul nos botões e destaques. Sempre claro. */
export const cores = {
  fundo: '#F3F5F7', card: '#FFFFFF', cabecalho: '#333333', cabecalhoTexto: '#FFFFFF', cabecalhoSuave: '#C4C7CC',
  primaria: '#1F5F8B', primariaClara: '#E3EEF6', texto: '#1C1C1E', suave: '#6B7280', borda: '#E3E6EA',
  chipBorda: '#D3D8DE', chipTexto: '#3F4752', erro: '#B3261E', erroClaro: '#FBE9E7', ok: '#2E7D32', aviso: '#C2410C', avisoClaro: '#FDEDE3',
};

const sombra = { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 };

export const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: 16, gap: 12, paddingBottom: 32 },
  cabecalho: { backgroundColor: cores.cabecalho, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, gap: 4 },
  cabecalhoTitulo: { color: cores.cabecalhoTexto, fontSize: 22, fontWeight: '700', letterSpacing: -0.2 },
  cabecalhoSub: { color: cores.cabecalhoSuave, fontSize: 14 },
  voltar: { color: cores.cabecalhoSuave, fontSize: 15, paddingVertical: 2 },
  titulo: { fontSize: 16, fontWeight: '700', color: cores.texto },
  subtitulo: { fontSize: 14, color: cores.suave },
  card: { backgroundColor: cores.card, borderRadius: 14, padding: 14, gap: 4, ...sombra },
  secao: { fontSize: 12, fontWeight: '800', color: cores.suave, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 6 },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 8 },
  botao: { backgroundColor: cores.primaria, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  botaoTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  botaoSec: { backgroundColor: cores.primariaClara },
  botaoSecTexto: { color: cores.primaria },
  passo: { width: 44, height: 44, borderRadius: 22, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  passoSec: { backgroundColor: cores.primariaClara },
  passoTexto: { fontSize: 24, color: '#fff', fontWeight: '600', lineHeight: 28 },
  passoTextoSec: { color: cores.primaria },
  qtd: { minWidth: 36, textAlign: 'center', fontSize: 18, fontWeight: '700', color: cores.texto },
  entrada: { minWidth: 0, backgroundColor: cores.card, borderWidth: 1, borderColor: cores.chipBorda, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, minHeight: 46, color: cores.texto },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: cores.chipBorda, backgroundColor: cores.card },
  chipAtivo: { backgroundColor: cores.primaria, borderColor: cores.primaria },
  chipTexto: { color: cores.chipTexto, fontWeight: '600', fontSize: 14 },
  chipTextoAtivo: { color: '#fff', fontWeight: '600', fontSize: 14 },
  erro: { color: cores.erro },
  rotulo: { fontSize: 13, fontWeight: '600', color: cores.suave },
  valor: { fontSize: 15, fontWeight: '700', color: cores.texto },
  etiqueta: { alignSelf: 'flex-start', backgroundColor: cores.primariaClara, color: cores.primaria, fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
  /** Seletor em duas partes (ex.: Com expediente | Sem expediente). */
  segmento: { flexDirection: 'row', backgroundColor: cores.card, borderRadius: 12, padding: 4, ...sombra },
  segmentoItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  segmentoAtivo: { backgroundColor: cores.primaria },
  segmentoTexto: { fontSize: 14, fontWeight: '700', color: cores.chipTexto },
});
