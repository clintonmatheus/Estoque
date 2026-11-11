import { AgendadorSync, type EstadoSync } from './agendador';

function criar(resultado: () => Promise<{ enviados: number; recebidos: number }>) {
  const sincronizar = jest.fn(resultado);
  const ag = new AgendadorSync({ sincronizar }, { atrasoMs: 1000, intervaloMs: 60_000, agora: () => '2026-11-06T12:00:00.000Z' });
  const estados: EstadoSync[] = [];
  ag.aoAtualizar((e) => estados.push(e));
  return { ag, sincronizar, estados };
}

describe('AgendadorSync', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('agrupa alterações seguidas numa só sincronização', async () => {
    const { ag, sincronizar } = criar(async () => ({ enviados: 1, recebidos: 0 }));
    ag.agendar(); ag.agendar(); ag.agendar();
    await jest.advanceTimersByTimeAsync(999);
    expect(sincronizar).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(sincronizar).toHaveBeenCalledTimes(1);
  });

  it('informa recebimentos e horário da última sincronização', async () => {
    const { ag, estados } = criar(async () => ({ enviados: 0, recebidos: 3 }));
    await ag.agora();
    expect(estados.at(-1)).toEqual({ sincronizando: false, recebidos: 3, ultimaEm: '2026-11-06T12:00:00.000Z' });
  });

  it('registra o erro sem derrubar o app e tenta de novo no intervalo', async () => {
    let falhar = true;
    const { ag, sincronizar, estados } = criar(async () => {
      if (falhar) throw new Error('Sem conexão');
      return { enviados: 0, recebidos: 0 };
    });
    const parar = ag.iniciar();
    await jest.advanceTimersByTimeAsync(0);
    expect(estados.at(-1)?.erro).toBe('Sem conexão');
    falhar = false;
    await jest.advanceTimersByTimeAsync(60_000);
    expect(sincronizar).toHaveBeenCalledTimes(2);
    expect(estados.at(-1)?.erro).toBeUndefined();
    parar();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(sincronizar).toHaveBeenCalledTimes(2);
  });
});
