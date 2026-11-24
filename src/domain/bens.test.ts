import { divergenciasDeCobranca, emPrazo, posicoesDoBem, problemasDeBens, situacaoLocacao, totalDoBem } from './bens';
import type { Autoria, Bem, MovimentoBem, Posse } from './tipos';

const por: Autoria = { id: 'u', nome: 'Marilia', em: '2026-11-10T12:00:00.000Z' };
const galpao: Posse = { tipo: 'galpao' };
const externo: Posse = { tipo: 'externo' };
const campo = (funcionarioId: string, localId: string): Posse => ({ tipo: 'campo', funcionarioId, localId });
let n = 0;
const mov = (o: Partial<MovimentoBem>): MovimentoBem => ({
  id: `m${n++}`, bemId: 'escora', data: '2026-11-01', quantidade: 1, origem: externo, destino: galpao, criado: { ...por, em: `2026-11-10T12:00:${String(n).padStart(2, '0')}.000Z` }, ...o,
});
const bem = (o: Partial<Bem>): Bem => ({ id: 'escora', nome: 'ESCORA', tipo: 'locado', controle: 'quantidade', ativo: true, criado: por, ...o });

describe('posição dos bens', () => {
  it('conta peças por posse: chegada, transferência entre obras e devolução à locadora', () => {
    const movs = [
      mov({ quantidade: 100, destino: galpao }),
      mov({ quantidade: 60, origem: galpao, destino: campo('joao', 'riachuelo') }),
      mov({ quantidade: 20, origem: campo('joao', 'riachuelo'), destino: campo('maria', 'macaiba') }),
      mov({ quantidade: 10, origem: galpao, destino: externo, motivo: 'devolucao-locadora' }),
    ];
    const pos = posicoesDoBem(movs, 'escora');
    expect(pos.map((p) => [p.posse.tipo, 'funcionarioId' in p.posse ? p.posse.funcionarioId : '', p.quantidade])).toEqual([
      ['galpao', '', 30], ['campo', 'joao', 40], ['campo', 'maria', 20],
    ]);
    expect(totalDoBem(movs, 'escora')).toBe(90);
  });

  it('ignora lançamentos cancelados e de outros bens', () => {
    const movs = [
      mov({ quantidade: 10 }),
      mov({ quantidade: 5, cancelado: { ...por, motivo: 'erro' } }),
      mov({ bemId: 'outro', quantidade: 99 }),
    ];
    expect(totalDoBem(movs, 'escora')).toBe(10);
  });

  it('aponta quem tirou mais do que havia na posse (mesmo retroativo)', () => {
    const a = mov({ quantidade: 10 });
    const b = mov({ quantidade: 4, origem: galpao, destino: campo('joao', 'x') });
    const c = mov({ quantidade: 8, origem: galpao, destino: campo('joao', 'y') }); // só restam 6
    expect([...problemasDeBens([a, b, c])]).toEqual([c.id]);
    // cancelar a entrada deixa as duas saídas sem lastro
    const semEntrada = { ...a, cancelado: { ...por, motivo: 'x' } };
    expect([...problemasDeBens([semEntrada, b, c])].sort()).toEqual([b.id, c.id].sort());
    // origem externa nunca falta
    expect(problemasDeBens([a]).size).toBe(0);
  });

  it('a data do lançamento manda na ordem, não a hora em que foi digitado', () => {
    const saida = mov({ data: '2026-11-05', quantidade: 5, origem: galpao, destino: campo('j', 'x') });
    const entrada = mov({ data: '2026-11-01', quantidade: 5 });
    expect(problemasDeBens([saida, entrada]).size).toBe(0);
    expect(problemasDeBens([saida, { ...entrada, data: '2026-11-06' }]).size).toBe(1);
  });
});

describe('prazos', () => {
  it('ferramenta individual em campo: prazo vem da última movimentação para a posse atual', () => {
    const movs = [
      mov({ bemId: 'furadeira', data: '2026-11-01' }),
      mov({ bemId: 'furadeira', data: '2026-11-02', origem: galpao, destino: campo('j', 'x'), prevista: '2026-11-09' }),
    ];
    expect(emPrazo(movs, 'furadeira', '2026-11-09')).toEqual({ prevista: '2026-11-09', atraso: 0 });
    expect(emPrazo(movs, 'furadeira', '2026-11-12')).toEqual({ prevista: '2026-11-09', atraso: 3 });
    const devolvida = [...movs, mov({ bemId: 'furadeira', data: '2026-11-10', origem: campo('j', 'x'), destino: galpao })];
    expect(emPrazo(devolvida, 'furadeira', '2026-11-12')).toBeUndefined();
  });

  it('locação: vencida, vencendo, em dia ou sem prazo; só enquanto ainda há peças em mãos', () => {
    const b = (prevista?: string) => bem({ locacao: { locadora: 'Agaé', prevista } });
    expect(situacaoLocacao(b('2026-11-10'), 5, '2026-11-12')).toEqual({ situacao: 'vencida', dias: -2 });
    expect(situacaoLocacao(b('2026-11-15'), 5, '2026-11-12')).toEqual({ situacao: 'vence', dias: 3 });
    expect(situacaoLocacao(b('2026-12-30'), 5, '2026-11-12')).toEqual({ situacao: 'ok', dias: 48 });
    expect(situacaoLocacao(b(), 5, '2026-11-12')).toBeUndefined();
    expect(situacaoLocacao(b('2026-11-10'), 0, '2026-11-12')).toBeUndefined();
    expect(situacaoLocacao(bem({ tipo: 'ferramenta' }), 5, '2026-11-12')).toBeUndefined();
  });
});

describe('cobrança na obra errada', () => {
  it('lista as peças que estão em obras diferentes da cobrada pela locadora', () => {
    const b = bem({ locacao: { locadora: 'Agaé', localCobrancaId: 'riachuelo' } });
    const movs = [
      mov({ quantidade: 100 }),
      mov({ quantidade: 50, origem: galpao, destino: campo('j', 'riachuelo') }),
      mov({ quantidade: 30, origem: galpao, destino: campo('m', 'macaiba') }),
      mov({ quantidade: 5, origem: galpao, destino: campo('k', 'macaiba') }),
    ];
    expect(divergenciasDeCobranca(b, posicoesDoBem(movs, 'escora'))).toEqual([{ localId: 'macaiba', quantidade: 35 }]);
    expect(divergenciasDeCobranca(bem({ locacao: { locadora: 'x' } }), posicoesDoBem(movs, 'escora'))).toEqual([]);
    expect(divergenciasDeCobranca(bem({ tipo: 'ferramenta' }), posicoesDoBem(movs, 'escora'))).toEqual([]);
  });
});
