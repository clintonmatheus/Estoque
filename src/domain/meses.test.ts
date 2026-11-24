import { fixosDoMes, formatarMes, lerMes, percentualNoMes } from './meses';

describe('meses', () => {
  it('lê e formata mm/aaaa', () => {
    expect(lerMes('8/2026')).toBe('2026-08');
    expect(lerMes('2026-08')).toBe('2026-08');
    expect(() => lerMes('13/2026')).toThrow('Mês inválido');
    expect(formatarMes('2026-08')).toBe('08/2026');
  });
  it('percentual e custos fixos que valem no mês', () => {
    const v = [{ desde: '2027-01', percentual: 35 }, { desde: '2000-01', percentual: 37.77 }];
    expect(percentualNoMes(v, '1999-12')).toBeUndefined();
    expect(percentualNoMes(v, '2026-12')).toBe(37.77);
    expect(percentualNoMes(v, '2027-01')).toBe(35);
    const fixos = [{ id: 'a', inicio: '2026-08' }, { id: 'b', inicio: '2026-01', fim: '2026-09' }];
    expect(fixosDoMes(fixos, '2026-07').map((x) => x.id)).toEqual(['b']);
    expect(fixosDoMes(fixos, '2026-10').map((x) => x.id)).toEqual(['a']);
  });
});
