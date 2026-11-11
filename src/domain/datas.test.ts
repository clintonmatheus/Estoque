import { adicionarDias, diaDaSemana, periodoSemanal, dataLocal } from './datas';

describe('adicionarDias', () => {
  it('soma dias atravessando o mês', () => {
    expect(adicionarDias('2026-08-30', 3)).toBe('2026-09-02');
  });
  it('subtrai dias', () => {
    expect(adicionarDias('2026-08-01', -1)).toBe('2026-07-31');
  });
});

describe('diaDaSemana', () => {
  it('retorna o nome em português', () => {
    expect(diaDaSemana('2026-06-29')).toBe('segunda-feira');
    expect(diaDaSemana('2026-08-01')).toBe('sábado');
    expect(diaDaSemana('2026-10-30')).toBe('sexta-feira');
  });
  it('rejeita data inválida', () => {
    expect(() => diaDaSemana('2026-02-30')).toThrow('Data inválida');
    expect(() => diaDaSemana('29/06/2026')).toThrow('Data inválida');
  });
});

describe('periodoSemanal', () => {
  it('semana de sábado a sexta (UBS e CAPS)', () => {
    expect(periodoSemanal('2026-08-01', 'sabado')).toEqual({ inicio: '2026-08-01', fim: '2026-08-07' });
    expect(periodoSemanal('2026-08-05', 'sabado')).toEqual({ inicio: '2026-08-01', fim: '2026-08-07' });
    expect(periodoSemanal('2026-08-07', 'sabado')).toEqual({ inicio: '2026-08-01', fim: '2026-08-07' });
    expect(periodoSemanal('2026-08-08', 'sabado')).toEqual({ inicio: '2026-08-08', fim: '2026-08-14' });
  });
  it('semana de segunda a domingo (USF Rocas)', () => {
    expect(periodoSemanal('2026-08-31', 'segunda')).toEqual({ inicio: '2026-08-31', fim: '2026-09-06' });
    expect(periodoSemanal('2026-09-06', 'segunda')).toEqual({ inicio: '2026-08-31', fim: '2026-09-06' });
  });
});

describe('dataLocal', () => {
  it('converte instante UTC para a data de Natal (UTC-3)', () => {
    expect(dataLocal('2026-08-10T02:30:00.000Z')).toBe('2026-08-09');
    expect(dataLocal('2026-08-10T03:00:00.000Z')).toBe('2026-08-10');
  });
});

import { formatarDataBR } from './datas';
describe('formatarDataBR', () => {
  it('formata em dd/mm/aaaa', () => expect(formatarDataBR('2026-11-05')).toBe('05/11/2026'));
  it('rejeita data inválida', () => expect(() => formatarDataBR('2026-13-01')).toThrow('Data inválida'));
});

import { motivoPadraoSemExpediente } from './datas';
describe('motivoPadraoSemExpediente', () => {
  it('sábado e domingo são fim de semana', () => {
    expect(motivoPadraoSemExpediente('2026-11-07')).toBe('Fim de semana');
    expect(motivoPadraoSemExpediente('2026-11-08')).toBe('Fim de semana');
  });
  it('dias úteis não têm motivo padrão', () => {
    expect(motivoPadraoSemExpediente('2026-11-06')).toBeUndefined();
  });
});

import { periodoDoMes } from './datas';
describe('periodoDoMes', () => {
  it('retorna primeiro e último dia do mês', () => {
    expect(periodoDoMes('2026-11-05')).toEqual({ inicio: '2026-11-01', fim: '2026-11-30' });
    expect(periodoDoMes('2026-12-31')).toEqual({ inicio: '2026-12-01', fim: '2026-12-31' });
  });
  it('trata fevereiro bissexto', () => {
    expect(periodoDoMes('2028-02-10').fim).toBe('2028-02-29');
    expect(periodoDoMes('2026-02-10').fim).toBe('2026-02-28');
  });
});

import { analisarDataBR, periodoMesAnterior, periodoMesSeguinte, deslocarPeriodo } from './datas';
describe('analisarDataBR', () => {
  it('converte dd/mm/aaaa para ISO', () => {
    expect(analisarDataBR('27/06/2026')).toBe('2026-06-27');
    expect(analisarDataBR(' 5/7/2026 ')).toBe('2026-07-05');
  });
  it('rejeita formatos e datas inexistentes', () => {
    for (const x of ['', 'abc', '2026-06-27', '31/02/2026', '32/01/2026', '10/13/2026', '1/1/26']) {
      expect(() => analisarDataBR(x)).toThrow('Data inválida');
    }
  });
});

describe('navegação de período', () => {
  it('mês anterior e seguinte', () => {
    const nov = { inicio: '2026-11-01', fim: '2026-11-30' };
    expect(periodoMesAnterior(nov)).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' });
    expect(periodoMesSeguinte(nov)).toEqual({ inicio: '2026-12-01', fim: '2026-12-31' });
    expect(periodoMesSeguinte({ inicio: '2026-12-01', fim: '2026-12-31' })).toEqual({ inicio: '2027-01-01', fim: '2027-01-31' });
  });
  it('desloca período em dias', () => {
    expect(deslocarPeriodo({ inicio: '2026-10-31', fim: '2026-11-06' }, -7)).toEqual({ inicio: '2026-10-24', fim: '2026-10-30' });
  });
});

import { indiceDiaSemana, nomeDoMes } from './datas';
describe('calendário', () => {
  it('índice do dia da semana (0 = domingo)', () => {
    expect(indiceDiaSemana('2026-11-01')).toBe(0);
    expect(indiceDiaSemana('2026-10-01')).toBe(4);
    expect(indiceDiaSemana('2026-11-07')).toBe(6);
  });
  it('nome do mês em português', () => {
    expect(nomeDoMes('2026-11-15')).toBe('novembro de 2026');
    expect(nomeDoMes('2027-03-01')).toBe('março de 2027');
  });
});

import { horaLocal } from './datas';
describe('horaLocal', () => {
  it('converte instante UTC para HH:MM de Natal', () => {
    expect(horaLocal('2026-11-05T12:00:00.000Z')).toBe('09:00');
    expect(horaLocal('2026-11-06T02:30:00.000Z')).toBe('23:30');
  });
});
