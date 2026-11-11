import type { ResultadoSync } from './sincronizador';

export interface EstadoSync {
  sincronizando: boolean;
  recebidos: number;
  ultimaEm?: string;
  erro?: string;
}

interface Opcoes { atrasoMs: number; intervaloMs: number; agora: () => string }

/** Decide quando sincronizar: logo após alterações (agrupadas), periodicamente e sob demanda. */
export class AgendadorSync {
  private timer?: ReturnType<typeof setTimeout>;
  private ouvintes = new Set<(e: EstadoSync) => void>();
  private estado: EstadoSync = { sincronizando: false, recebidos: 0 };

  constructor(private sync: { sincronizar(): Promise<ResultadoSync> }, private o: Opcoes) {}

  aoAtualizar(cb: (e: EstadoSync) => void) {
    this.ouvintes.add(cb);
    return () => { this.ouvintes.delete(cb); };
  }

  private emitir(e: EstadoSync) {
    this.estado = e;
    this.ouvintes.forEach((cb) => cb(e));
  }

  agendar() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.agora(); }, this.o.atrasoMs);
  }

  async agora(): Promise<void> {
    this.emitir({ ...this.estado, sincronizando: true });
    try {
      const r = await this.sync.sincronizar();
      this.emitir({ sincronizando: false, recebidos: r.recebidos, ultimaEm: this.o.agora() });
    } catch (e) {
      this.emitir({ ...this.estado, sincronizando: false, recebidos: 0, erro: (e as Error).message || 'Falha na sincronização' });
    }
  }

  /** Sincroniza agora e a cada intervalo; devolve a função para parar. */
  iniciar(): () => void {
    void this.agora();
    const id = setInterval(() => void this.agora(), this.o.intervaloMs);
    return () => { clearInterval(id); if (this.timer) clearTimeout(this.timer); };
  }
}
