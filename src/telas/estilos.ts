import { StyleSheet } from 'react-native';

export const cores = {
  fundo: '#F2F3F5', card: '#FFFFFF', cabecalho: '#2B2B2B', primaria: '#2F6F9F', primariaClara: '#E6EFF6',
  texto: '#1C1C1E', suave: '#6B7280', borda: '#E2E4E8', erro: '#B3261E', ok: '#2E7D32', aviso: '#B26A00',
};

export const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { padding: 16, gap: 12, paddingBottom: 48 },
  cabecalho: { backgroundColor: cores.cabecalho, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16, gap: 6 },
  cabecalhoTitulo: { color: '#fff', fontSize: 20, fontWeight: '700' },
  cabecalhoSub: { color: '#C9CBD1', fontSize: 14 },
  voltar: { color: '#C9CBD1', fontSize: 15, paddingVertical: 4 },
  logo: { width: 180, height: 53, resizeMode: 'contain' },
  titulo: { fontSize: 17, fontWeight: '700', color: cores.texto },
  subtitulo: { fontSize: 14, color: cores.suave },
  card: {
    backgroundColor: cores.card, borderRadius: 14, padding: 16, gap: 4,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  secao: { fontSize: 13, fontWeight: '700', color: cores.suave, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 8 },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 8 },
  botao: { backgroundColor: cores.primaria, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  botaoTexto: { color: '#fff', fontWeight: '700', fontSize: 16 },
  passo: { width: 44, height: 44, borderRadius: 22, backgroundColor: cores.primaria, alignItems: 'center', justifyContent: 'center' },
  passoSec: { backgroundColor: cores.primariaClara },
  passoTexto: { fontSize: 24, color: '#fff', fontWeight: '600', lineHeight: 28 },
  passoTextoSec: { color: cores.primaria },
  qtd: { minWidth: 36, textAlign: 'center', fontSize: 18, fontWeight: '600', color: cores.texto },
  entrada: { backgroundColor: cores.card, borderWidth: 1, borderColor: cores.borda, borderRadius: 12, padding: 12, fontSize: 16, minHeight: 44, color: cores.texto },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: cores.primaria, backgroundColor: cores.card },
  chipAtivo: { backgroundColor: cores.primaria },
  chipTexto: { color: cores.primaria, fontWeight: '600' },
  chipTextoAtivo: { color: '#fff' },
  erro: { color: cores.erro },
  rotulo: { fontSize: 13, fontWeight: '600', color: cores.suave },
  valor: { fontSize: 15, fontWeight: '700', color: cores.texto },
  etiqueta: { alignSelf: 'flex-start', backgroundColor: cores.primariaClara, color: cores.primaria, fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
});
