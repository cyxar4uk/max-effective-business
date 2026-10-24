import { describe, expect, it } from 'vitest';
import { addBusinessDays, formatPilotMetrics, median, mskDate, parsePeriod, type PilotMetrics } from './pilot.js';

describe('addBusinessDays', () => {
  it('будни: +2 рабочих дня — через двое суток', () => {
    // Понедельник 5.10.2026, 10:00 МСК
    expect(addBusinessDays(new Date('2026-10-05T10:00:00+03:00'), 2)).toEqual(new Date('2026-10-07T10:00:00+03:00'));
  });

  it('пятница: выходные не считаются — до вторника', () => {
    expect(addBusinessDays(new Date('2026-10-09T15:00:00+03:00'), 2)).toEqual(new Date('2026-10-13T15:00:00+03:00'));
  });

  it('суббота: первый рабочий день — понедельник', () => {
    expect(addBusinessDays(new Date('2026-10-10T12:00:00+03:00'), 2)).toEqual(new Date('2026-10-13T12:00:00+03:00'));
  });

  it('выходной считается по Москве, а не по UTC: пятница 23:30 МСК + 1 — понедельник', () => {
    expect(addBusinessDays(new Date('2026-10-09T23:30:00+03:00'), 1)).toEqual(new Date('2026-10-12T23:30:00+03:00'));
  });
});

describe('median', () => {
  it('пусто — null; нечётное — середина; чётное — среднее двух', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('parsePeriod', () => {
  it('даты включительно по Москве: to — полночь следующего дня', () => {
    expect(parsePeriod(['--from', '2026-10-01', '--to', '2026-10-31'])).toEqual({
      from: new Date('2026-10-01T00:00:00+03:00'),
      to: new Date('2026-11-01T00:00:00+03:00'),
    });
  });

  it('без флагов — без границ', () => {
    expect(parsePeriod([])).toEqual({ from: null, to: null });
  });

  it('кривая дата — понятная ошибка', () => {
    expect(() => mskDate('01.10.2026')).toThrow('ГГГГ-ММ-ДД');
    expect(() => mskDate('2026-13-01')).toThrow('Нет такой даты');
  });
});

describe('formatPilotMetrics', () => {
  const m: PilotMetrics = {
    places: 4,
    firstMatch: { withResponse: 3, medianHours: 5.5, withinTarget: 2 },
    interests: { total: 12, strong: 6, employer: 10, declined: 3 },
    employerResponseMedianHours: 20.5,
    funnel: { profiles: 8, interested: 5 },
    invitations: 2,
    bands: [
      { band: '80+', interested: 4, invited: 2 },
      { band: '70–79', interested: 2, invited: 0 },
      { band: '60–69', interested: 3, invited: 0 },
      { band: '<60', interested: 1, invited: 0 },
    ],
  };

  it('таблица с процентами и периодом', () => {
    const text = formatPilotMetrics(m, parsePeriod(['--from', '2026-10-01', '--to', '2026-10-31']));
    expect(text).toContain('с 2026-10-01 по 2026-10-31');
    expect(text).toMatch(/Мест с подходящим откликом \(≥ 60 %\)\s+3 \(75 %\)/);
    expect(text).toMatch(/медиана\s+5\.5 ч/);
    expect(text).toMatch(/работодатель не отклонил\s+7 из 10 \(70 %\)/);
    expect(text).toMatch(/Ответ работодателя на отклик, медиана\s+20\.5 ч/);
    expect(text).toMatch(/не дольше 2 рабочих дней\s+2 \(67 %\)/);
    expect(text).toMatch(/≥ 70 %»?\s+6 из 12 \(50 %\)/);
    // «Не отклонил» — только по местам работодателей (10 из 12 откликов), «Работа России» не считается

    expect(text).toMatch(/первое «Интересно»\s+5 из 8 \(63 %\)/);
    expect(text).toMatch(/приглашены при совпадении 80\+ %\s+2 из 4 \(50 %\)/);
    expect(text).toMatch(/приглашены при совпадении <60 %\s+0 из 1 \(0 %\)/);
  });

  it('пустая база — прочерки вместо деления на ноль', () => {
    const empty: PilotMetrics = { places: 0, firstMatch: { withResponse: 0, medianHours: null, withinTarget: 0 }, interests: { total: 0, strong: 0, employer: 0, declined: 0 }, employerResponseMedianHours: null, funnel: { profiles: 0, interested: 0 }, invitations: 0, bands: [] };
    const text = formatPilotMetrics(empty, { from: null, to: null });
    expect(text).toContain('с начала по сегодня');
    expect(text).not.toContain('NaN');
    expect(text).toMatch(/медиана\s+—/);
  });
});
