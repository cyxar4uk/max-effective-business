import { describe, expect, it } from 'vitest';
import { addBusinessDays, bind, formatPilotMetrics, median, mskDate, parseExcludeIds, parsePeriod, type PilotMetrics } from './pilot.js';

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

describe('parseExcludeIds', () => {
  it('max_user_id команды через запятую, пробел или точку с запятой; мусор отбрасываем', () => {
    expect(parseExcludeIds('411890855, 123;456  789')).toEqual([411890855, 123, 456, 789]);
    expect(parseExcludeIds('abc,,0,12.5')).toEqual([]);
    expect(parseExcludeIds(undefined)).toEqual([]);
  });
});

describe('bind', () => {
  it('именованные параметры → позиционные в порядке появления, неиспользуемые не передаются', () => {
    expect(bind('a = :thr AND b = :from AND c = :thr AND d::text', { from: 1, thr: 60, excl: [] })).toEqual([
      'a = $1 AND b = $2 AND c = $1 AND d::text',
      [60, 1],
    ]);
  });
});

describe('formatPilotMetrics', () => {
  const m: PilotMetrics = {
    places: 4,
    firstMatch: { eligible: 3, withinTarget: 2, withResponse: 3, medianHours: 5.5 },
    interests: { total: 12, strong: 6 },
    decisions: { invited: 3, declined: 1, olderThan24h: 8, pendingOver24h: 4, decidedWithin24h: 3, medianHours: 20.5 },
    funnel: { profiles: 8, interested: 5 },
    invitations: 2,
    bands: [
      { band: '80+', interested: 4, invited: 2 },
      { band: '70–79', interested: 2, invited: 0 },
      { band: '60–69', interested: 3, invited: 0 },
      { band: '<60', interested: 1, invited: 0 },
    ],
  };

  it('таблица с процентами и периодом: у долей числитель и знаменатель, у медиан — n, порог из настроек', () => {
    const text = formatPilotMetrics(m, parsePeriod(['--from', '2026-10-01', '--to', '2026-10-31']), { threshold: 65 });
    expect(text).toContain('с 2026-10-01 по 2026-10-31');
    expect(text).toContain('самоотзывов и аккаунтов команды');
    // Главная метрика — по местам, у которых срок уже прошёл, а не по местам с откликом (#125)
    expect(text).toMatch(/не дольше 2 рабочих дней\s+2 из 3 \(67 %\) — из мест, у которых срок уже прошёл/);
    expect(text).toMatch(/Мест с подходящим откликом \(≥ 65 % и все обязательные\)\s+3 из 4 \(75 %\)/);
    expect(text).toMatch(/первый подходящий отклик, медиана\s+5\.5 ч \(n = 3\)/);
    expect(text).toMatch(/≥ 70 %»?\s+6 из 12 \(50 %\)/);
    // Вместо «не отклонил» (100 %, если работодатель молчит) — пригласил из принятых решений: 3 / (3 + 1)
    expect(text).toMatch(/пригласил — из принятых решений\s+3 из 4 \(75 %\)/);
    expect(text).not.toMatch(/не отклонил/);
    expect(text).toMatch(/старше суток без решения\s+4 из 8 \(50 %\)/);
    expect(text).toMatch(/старше суток, решённые за сутки\s+3 из 8 \(38 %\)/);
    expect(text).toMatch(/Ответ работодателя на отклик, медиана\s+20\.5 ч \(n = 4\)/);
    expect(text).toMatch(/первое «Интересно»\s+5 из 8 \(63 %\)/);
    expect(text).toMatch(/приглашены при совпадении 80\+ %\s+2 из 4 \(50 %\)/);
    expect(text).toMatch(/приглашены при совпадении <60 %\s+0 из 1 \(0 %\)/);
  });

  it('пустая база — прочерки вместо деления на ноль', () => {
    const empty: PilotMetrics = {
      places: 0,
      firstMatch: { eligible: 0, withinTarget: 0, withResponse: 0, medianHours: null },
      interests: { total: 0, strong: 0 },
      decisions: { invited: 0, declined: 0, olderThan24h: 0, pendingOver24h: 0, decidedWithin24h: 0, medianHours: null },
      funnel: { profiles: 0, interested: 0 },
      invitations: 0,
      bands: [],
    };
    const text = formatPilotMetrics(empty, { from: null, to: null });
    expect(text).toContain('с начала по сегодня');
    expect(text).not.toContain('NaN');
    expect(text).toMatch(/медиана\s+—/);
    expect(text).toMatch(/0 из 0 \(—\)/);
  });
});
