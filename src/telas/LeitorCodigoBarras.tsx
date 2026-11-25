import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Botao } from './componentes';
import { cores, estilos } from './estilos';

/** Câmera que lê o código de barras do boleto (44 dígitos, padrão "intercalado 2 de 5"). Lê uma vez e fecha. */
export function LeitorCodigoBarras({ visivel, onLido, onFechar, aceita }: {
  visivel: boolean; onLido: (codigo: string) => void; onFechar: () => void;
  /** Recusa leituras que não são boleto (o leitor continua tentando). */
  aceita?: (codigo: string) => boolean;
}) {
  const [permissao, pedir] = useCameraPermissions();
  const lido = useRef(false);
  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={onFechar} onShow={() => { lido.current = false; }}>
      <View style={[estilos.tela, { backgroundColor: '#000' }]}>
        {permissao?.granted ? (
          <CameraView testID="camera-boleto" style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['itf14', 'code128'] }}
            onBarcodeScanned={({ data }) => {
              const n = data.replace(/\D/g, '');
              if (lido.current || n.length < 44 || (aceita && !aceita(n))) return;
              lido.current = true;
              onLido(n);
            }} />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
            <Text style={{ color: '#fff', fontSize: 16 }}>Para ler o código de barras, o app precisa usar a câmera.</Text>
            <Botao testID="permitir-camera" titulo="Permitir câmera" onPress={() => void pedir()} />
          </View>
        )}
        <View style={{ position: 'absolute', top: 48, left: 16, right: 16, gap: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Aponte para o código de barras do boleto</Text>
          <Text style={{ color: '#fff' }}>Deixe o boleto reto e bem iluminado; se não ler, digite a linha digitável.</Text>
        </View>
        <Pressable testID="fechar-camera" onPress={onFechar} style={{ position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: cores.card, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 28 }}>
          <Text style={{ color: cores.primaria, fontWeight: '700' }}>Fechar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
