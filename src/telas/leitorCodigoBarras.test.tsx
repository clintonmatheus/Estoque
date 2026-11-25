import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { EntradaBoleto } from './EntradaBoleto';

let aoLer: ((e: { data: string }) => void) | undefined;
jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
    CameraView: (p: { onBarcodeScanned: (e: { data: string }) => void; testID: string }) => { aoLer = p.onBarcodeScanned; return <View testID={p.testID} />; },
  };
});

const fotos = { tirarFoto: async () => undefined, escolherDaGaleria: async () => undefined };
function Tela({ lidos }: { lidos: unknown[] }) {
  const [v, setV] = useState('');
  return <EntradaBoleto valor={v} onMudar={setV} hoje="2026-11-25" servicoFotos={fotos} camera onLido={(b) => lidos.push(b)} />;
}

describe('leitor de código de barras', () => {
  it('ignora leitura que não é boleto e aceita o código de barras válido (uma vez)', async () => {
    const lidos: unknown[] = [];
    await render(<Tela lidos={lidos} />);
    await fireEvent.press(screen.getByTestId('ler-camera'));
    expect(await screen.findByTestId('camera-boleto')).toBeTruthy();
    await act(async () => { aoLer?.({ data: '7891234567895' }); });            // EAN de produto: ignorado
    await act(async () => { aoLer?.({ data: '34197000000000150001111111111111111111111111' }); }); // 44 dígitos com DV errado: ignorado
    expect(lidos).toHaveLength(0);
    await act(async () => { aoLer?.({ data: '34198000000000150001111111111111111111111111' }); });
    expect(await screen.findByText(/Boleto lido: R\$ 150,00/)).toBeTruthy();
    expect(lidos).toHaveLength(1);
    expect(screen.queryByTestId('camera-boleto')).toBeNull();
  });
});
