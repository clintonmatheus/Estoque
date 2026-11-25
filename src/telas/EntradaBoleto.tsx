import { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { lerBoleto, type BoletoLido } from '../domain/boleto';
import { formatarDataBR } from '../domain/datas';
import { formatarMoeda } from '../domain/formato';
import { lerBoletoDoPdf } from '../domain/pdf';
import type { DocumentoEscolhido, ServicoFotos } from '../fotos/servico';
import { Botao, Campo } from './componentes';
import { estilos, cores } from './estilos';
import { LeitorCodigoBarras } from './LeitorCodigoBarras';

/**
 * Boleto: digitar ou colar a linha digitável, ler o código de barras pela câmera ou achar o código dentro de um PDF.
 * Mostra o que foi lido (valor e vencimento) ou o motivo de o código ser recusado.
 */
export function EntradaBoleto({ valor, onMudar, hoje, servicoFotos, onLido, onPdf, camera = Platform.OS !== 'web' }: {
  valor: string; onMudar: (texto: string) => void; hoje: string; servicoFotos: ServicoFotos;
  onLido?: (b: BoletoLido) => void;
  /** O PDF escolhido também vira anexo do pedido. */
  onPdf?: (d: DocumentoEscolhido) => void;
  camera?: boolean;
}) {
  const [aberta, setAberta] = useState(false);
  const [aviso, setAviso] = useState<string>();
  const { lido, erro } = useMemo(() => {
    if (!valor.trim()) return {};
    try { return { lido: lerBoleto(valor, hoje) }; } catch (e) { return { erro: e instanceof Error ? e.message : 'Boleto inválido' }; }
  }, [valor, hoje]);

  // Digitado, colado, lido do PDF ou da câmera: quando o código é válido, avisa quem usa (preencher valor e vencimento).
  useEffect(() => { if (lido) onLido?.(lido); }, [lido?.codigoBarras]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (t: string) => { setAviso(undefined); onMudar(t); };
  const ler = async () => {
    setAviso(undefined);
    try {
      const d = servicoFotos.escolherDocumento ? await servicoFotos.escolherDocumento() : undefined;
      if (!d) return;
      if (d.formato !== 'pdf' || !d.bytes) { setAviso('Escolha o PDF do boleto. Para foto, use a câmera ou digite o código.'); return; }
      onPdf?.(d);
      const r = lerBoletoDoPdf(d.bytes, hoje);
      if (r) { onMudar(r.linha); setAviso('Código lido do PDF.'); }
      else setAviso('Não achei o código de barras no PDF (pode ser imagem escaneada). Digite a linha digitável ou use a câmera.');
    } catch (e) { setAviso(e instanceof Error ? e.message : 'Não consegui ler o PDF'); }
  };

  return (
    <View style={{ gap: 8 }}>
      <Campo testID="pedido-boleto" rotulo="Linha digitável ou código de barras" value={valor} onChangeText={mudar} keyboardType="numbers-and-punctuation" multiline />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {camera && <Botao testID="ler-camera" secundario titulo="Ler com a câmera" onPress={() => setAberta(true)} />}
        <Botao testID="ler-pdf" secundario titulo="Ler do PDF" onPress={() => void ler()} />
      </View>
      {lido && <Text testID="boleto-lido" style={{ color: cores.ok, fontWeight: '600' }}>Boleto lido{lido.valor !== undefined ? `: ${formatarMoeda(lido.valor)}` : ''}{lido.vencimento ? `, vence ${formatarDataBR(lido.vencimento)}` : ''}</Text>}
      {erro && <Text testID="boleto-erro" style={estilos.erro}>{erro}</Text>}
      {aviso && <Text testID="boleto-aviso" style={estilos.subtitulo}>{aviso}</Text>}
      <LeitorCodigoBarras visivel={aberta} onFechar={() => setAberta(false)}
        aceita={(c) => { try { lerBoleto(c, hoje); return true; } catch { return false; } }}
        onLido={(c) => { setAberta(false); mudar(c); }} />
    </View>
  );
}
