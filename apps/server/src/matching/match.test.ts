import { describe, expect, it } from 'vitest';
import {
  checkFilters,
  computeScore,
  matchStudentToInternship,
  compareForFeed,
  normalizeCity,
  practiceMonthFits,
  shouldNotify,
} from './match.js';
import { matcher } from './index.js';
import type { InternshipMatchInput, StudentMatchInput } from './types.js';

const student = (over: Partial<StudentMatchInput> = {}): StudentMatchInput => ({
  skills: [],
  formats: ['office', 'hybrid', 'remote'],
  city: 'Москва',
  ...over,
});

const internship = (over: Partial<InternshipMatchInput> = {}): InternshipMatchInput => ({
  requiredSkills: [],
  niceSkills: [],
  format: 'office',
  city: 'Москва',
  ...over,
});

describe('computeScore', () => {
  it('70 % обязательные + 30 % желательные', () => {
    // 1 из 2 обязательных, 1 из 1 желательного: 35 + 30
    expect(computeScore(1, 2, 1, 1)).toBe(65);
  });

  it('без желательных считает только обязательные', () => {
    expect(computeScore(1, 2, 0, 0)).toBe(50);
    expect(computeScore(2, 3, 0, 0)).toBe(67);
  });

  it('без обязательных считает только желательные', () => {
    expect(computeScore(0, 0, 1, 4)).toBe(25);
  });

  it('без требований — 100', () => {
    expect(computeScore(0, 0, 0, 0)).toBe(100);
  });

  it('округляет до целых, половину вверх', () => {
    // 70 × 1/3 + 30 × 0 = 23,33 → 23
    expect(computeScore(1, 3, 0, 1)).toBe(23);
    // 70 × 1/4 + 30 × 0 = 17,5 → 18
    expect(computeScore(1, 4, 0, 1)).toBe(18);
    // 70 × 2/3 + 30 × 1/2 = 61,67 → 62
    expect(computeScore(2, 3, 1, 2)).toBe(62);
  });

  it('границы: всё закрыто — 100, ничего — 0', () => {
    expect(computeScore(3, 3, 2, 2)).toBe(100);
    expect(computeScore(0, 3, 0, 2)).toBe(0);
  });
});

describe('matchStudentToInternship', () => {
  it('всё закрыто', () => {
    const r = matchStudentToInternship(
      student({ skills: ['excel', 'sql', 'power_bi'] }),
      internship({ requiredSkills: ['excel', 'sql'], niceSkills: ['power_bi'] }),
    );
    expect(r).toEqual({
      score: 100,
      passesFilters: true,
      filterFailures: [],
      mustMatched: ['excel', 'sql'],
      mustMissing: [],
      niceMatched: ['power_bi'],
      niceMissing: [],
    });
  });

  it('ничего не закрыто', () => {
    const r = matchStudentToInternship(
      student({ skills: ['figma'] }),
      internship({ requiredSkills: ['excel', 'sql'], niceSkills: ['power_bi'] }),
    );
    expect(r.score).toBe(0);
    expect(r.mustMissing).toEqual(['excel', 'sql']);
    expect(r.niceMissing).toEqual(['power_bi']);
    expect(r.passesFilters).toBe(true);
  });

  it('частично: пример из docs/api.md', () => {
    // 1 из 2 обязательных, 1 из 1 желательного
    const r = matchStudentToInternship(
      student({ skills: ['excel', 'power_bi'] }),
      internship({ requiredSkills: ['excel', 'sql'], niceSkills: ['power_bi'] }),
    );
    expect(r.score).toBe(65);
    expect(r.mustMatched).toEqual(['excel']);
    expect(r.mustMissing).toEqual(['sql']);
  });

  it('нет обязательных навыков', () => {
    const r = matchStudentToInternship(
      student({ skills: ['excel'] }),
      internship({ niceSkills: ['excel', 'sql'] }),
    );
    expect(r.score).toBe(50);
    expect(r.mustMatched).toEqual([]);
    expect(r.mustMissing).toEqual([]);
  });

  it('нет желательных навыков', () => {
    const r = matchStudentToInternship(
      student({ skills: ['excel'] }),
      internship({ requiredSkills: ['excel', 'sql'] }),
    );
    expect(r.score).toBe(50);
    expect(r.niceMatched).toEqual([]);
    expect(r.niceMissing).toEqual([]);
  });

  it('дубли не влияют, навык в обоих списках считается обязательным', () => {
    const r = matchStudentToInternship(
      student({ skills: ['excel', 'excel'] }),
      internship({ requiredSkills: ['excel', 'excel', 'sql'], niceSkills: ['excel', 'power_bi'] }),
    );
    expect(r.mustMatched).toEqual(['excel']);
    expect(r.mustMissing).toEqual(['sql']);
    expect(r.niceMissing).toEqual(['power_bi']);
    // 70 × 1/2 + 30 × 0/1 = 35
    expect(r.score).toBe(35);
  });

  it('не прошёл фильтр по формату: процент считается, но passesFilters = false', () => {
    const r = matchStudentToInternship(
      student({ skills: ['excel'], formats: ['remote'] }),
      internship({ requiredSkills: ['excel'], format: 'office' }),
    );
    expect(r.score).toBe(100);
    expect(r.passesFilters).toBe(false);
    expect(r.filterFailures).toContain('format');
  });

  it('не прошёл фильтр по городу для очной стажировки', () => {
    const r = matchStudentToInternship(
      student({ skills: ['excel'], city: 'Казань' }),
      internship({ requiredSkills: ['excel'], format: 'office', city: 'Москва' }),
    );
    expect(r.passesFilters).toBe(false);
    expect(r.filterFailures).toEqual(['city']);
  });
});

describe('checkFilters', () => {
  it('удалённая стажировка: город не проверяется', () => {
    expect(checkFilters(student({ city: 'Казань' }), internship({ format: 'remote', city: 'Москва' }))).toEqual([]);
    expect(checkFilters(student({ city: null }), internship({ format: 'remote', city: null }))).toEqual([]);
  });

  it('гибрид требует совпадения города', () => {
    expect(checkFilters(student({ city: 'Казань' }), internship({ format: 'hybrid', city: 'Москва' }))).toEqual(['city']);
  });

  it('город сравнивается без учёта регистра, пробелов и ё', () => {
    expect(checkFilters(student({ city: '  королёв ' }), internship({ city: 'Королев' }))).toEqual([]);
  });

  it('город студента не указан — очная не проходит', () => {
    expect(checkFilters(student({ city: null }), internship({ city: 'Москва' }))).toEqual(['city']);
  });

  it('студент без выбранных форматов не проходит', () => {
    expect(checkFilters(student({ formats: [] }), internship({ format: 'remote' }))).toEqual(['format']);
  });

  it('оба фильтра сразу', () => {
    expect(checkFilters(student({ formats: ['remote'], city: 'Казань' }), internship())).toEqual(['format', 'city']);
  });
});

describe('normalizeCity', () => {
  it('приводит к общему виду', () => {
    expect(normalizeCity(' Нижний   Новгород ')).toBe('нижний новгород');
    expect(normalizeCity(null)).toBe('');
  });

  it('приставка «г.» / «город», хвост «Россия», дефис с пробелами, точка в конце', () => {
    expect(normalizeCity('г. Москва')).toBe('москва');
    expect(normalizeCity('г Москва')).toBe('москва');
    expect(normalizeCity('город Казань')).toBe('казань');
    expect(normalizeCity('Москва, Россия')).toBe('москва');
    expect(normalizeCity('Санкт - Петербург')).toBe('санкт-петербург');
    expect(normalizeCity('Москва.')).toBe('москва');
  });

  it('регион и страна через запятую — в любом порядке, уточнение в скобках (#101)', () => {
    for (const c of ['Казань, Татарстан', 'Казань, Республика Татарстан', 'Республика Татарстан, Казань', 'г. Казань, РТ', 'Казань (Татарстан)', 'Казань, Россия']) {
      expect(normalizeCity(c), c).toBe('казань');
    }
    expect(normalizeCity('Россия, Москва')).toBe('москва');
    expect(normalizeCity('Москва, Московская обл.')).toBe('москва');
    expect(normalizeCity('Химки, Московская область')).toBe('химки');
    expect(normalizeCity('СПб, Ленинградская обл.')).toBe('санкт-петербург');
    expect(normalizeCity('Набережные Челны, Татарстан')).toBe('набережные челны');
  });

  it('город с регионом проходит фильтр на очное место в Казани (#101)', () => {
    const r = matchStudentToInternship(student({ city: 'Казань, Татарстан', skills: ['a'] }), internship({ requiredSkills: ['a'], format: 'office', city: 'Казань' }));
    expect(r.passesFilters).toBe(true);
    const other = matchStudentToInternship(student({ city: 'Набережные Челны, Татарстан', skills: ['a'] }), internship({ requiredSkills: ['a'], format: 'office', city: 'Казань' }));
    expect(other.filterFailures).toContain('city');
  });

  it('сокращения и латиница для городов пилота', () => {
    for (const c of ['Мск', 'МСК', 'Moscow', 'moskva']) expect(normalizeCity(c), c).toBe('москва');
    for (const c of ['СПб', 'Питер', 'Петербург', 'С-Петербург', 'Санкт Петербург', 'Saint Petersburg', 'St. Petersburg']) {
      expect(normalizeCity(c), c).toBe('санкт-петербург');
    }
    expect(normalizeCity('Kazan')).toBe('казань');
  });

  it('не склеивает разные города: «Гатчина» — не «Атчина», «Городец» остаётся «Городцом»', () => {
    expect(normalizeCity('Гатчина')).toBe('гатчина');
    expect(normalizeCity('Городец')).toBe('городец');
    expect(normalizeCity('Москва')).not.toBe(normalizeCity('Московский'));
  });

  it('фильтр города: «г. Москва» в анкете проходит на офисное место в Москве', () => {
    const r = matchStudentToInternship(student({ city: 'г. Москва', skills: ['a'] }), internship({ requiredSkills: ['a'], format: 'office', city: 'Москва' }));
    expect(r.passesFilters).toBe(true);
    const spb = matchStudentToInternship(student({ city: 'СПб', skills: ['a'] }), internship({ requiredSkills: ['a'], format: 'hybrid', city: 'Санкт-Петербург' }));
    expect(spb.passesFilters).toBe(true);
  });
});

describe('shouldNotify', () => {
  const base = matchStudentToInternship(student({ skills: ['a'] }), internship({ requiredSkills: ['a'] }));

  it('порог по умолчанию 60 включительно', () => {
    expect(shouldNotify({ ...base, score: 60 })).toBe(true);
    expect(shouldNotify({ ...base, score: 59 })).toBe(false);
  });

  it('порог из конфига', () => {
    expect(shouldNotify({ ...base, score: 70 }, 75)).toBe(false);
  });

  it('не прошёл фильтры — не уведомляем даже при 100', () => {
    expect(shouldNotify({ ...base, score: 100, passesFilters: false, filterFailures: ['city'] })).toBe(false);
  });
});

describe('matcher (контракт API)', () => {
  it('отдаёт eligible и match без служебных полей', () => {
    const r = matcher(
      { skills: ['excel', 'power_bi'], formats: ['office'], city: 'Москва' },
      { requiredSkills: ['excel', 'sql'], niceSkills: ['power_bi'], format: 'office', city: 'Москва' },
    );
    expect(r).toEqual({
      eligible: true,
      match: { score: 65, mustMatched: ['excel'], mustMissing: ['sql'], niceMatched: ['power_bi'], niceMissing: [] },
    });
  });

  it('eligible = false, если фильтр не пройден', () => {
    const r = matcher(
      { skills: ['excel'], formats: ['remote'], city: 'Москва' },
      { requiredSkills: ['excel'], niceSkills: [], format: 'office', city: 'Москва' },
    );
    expect(r.eligible).toBe(false);
    expect(r.match.score).toBe(100);
  });

  it('только желательные и ни одного совпадения — 0 %, а не 70 %', () => {
    const r = matcher(
      { skills: [], formats: ['remote'], city: 'Москва' },
      { requiredSkills: [], niceSkills: ['sql'], format: 'remote', city: null },
    );
    expect(r.match.score).toBe(0);
  });
});

describe('shouldNotify: все обязательные навыки (#82)', () => {
  it('без одного обязательного — нет уведомления, даже если процент выше порога', () => {
    // 1 из 2 обязательных и все желательные: 35 + 30 = 65 %
    const r = matchStudentToInternship(student({ skills: ['a', 'x', 'y'] }), internship({ requiredSkills: ['a', 'b'], niceSkills: ['x', 'y'] }));
    expect(r.score).toBe(65);
    expect(shouldNotify(r)).toBe(false);
  });

  it('все обязательные закрыты — уведомление при проценте от порога', () => {
    const r = matchStudentToInternship(student({ skills: ['a', 'b'] }), internship({ requiredSkills: ['a', 'b'], niceSkills: ['x', 'y'] }));
    expect(r.score).toBe(70);
    expect(shouldNotify(r)).toBe(true);
  });

  it('место без обязательных — решает только процент по желательным', () => {
    const r = matchStudentToInternship(student({ skills: ['x'] }), internship({ niceSkills: ['x', 'y'] }));
    expect(shouldNotify(r)).toBe(false); // 50 %
    expect(shouldNotify(matchStudentToInternship(student({ skills: ['x', 'y'] }), internship({ niceSkills: ['x', 'y'] })))).toBe(true);
  });
});

describe('practiceMonthFits', () => {
  it('месяц внутри сроков, на границах и вне', () => {
    expect(practiceMonthFits('2026-11', '2026-10-19', '2027-01-29')).toBe(true);
    expect(practiceMonthFits('2026-10', '2026-10-19', '2027-01-29')).toBe(true); // начинается в этом месяце
    expect(practiceMonthFits('2027-01', '2026-10-19', '2027-01-29')).toBe(true); // заканчивается в этом месяце
    expect(practiceMonthFits('2026-09', '2026-10-19', '2027-01-29')).toBe(false);
    expect(practiceMonthFits('2027-02', '2026-10-19', '2027-01-29')).toBe(false);
  });

  it('у места нет сроков — подходит; студент месяц не указал — неизвестно', () => {
    expect(practiceMonthFits('2026-11', null, null)).toBe(true);
    expect(practiceMonthFits('2026-11', '2026-12-01', null)).toBe(false);
    expect(practiceMonthFits(null, '2026-10-19', '2027-01-29')).toBeNull();
    expect(practiceMonthFits('ноябрь', '2026-10-19', '2027-01-29')).toBeNull();
  });
});

describe('compareForFeed', () => {
  const item = (key: string, score: number, missing: number, datesFit: boolean | null) => ({
    key,
    match: { score, mustMissing: Array.from({ length: missing }, (_, i) => `m${i}`) },
    datesFit,
  });

  it('процент главный; при равном — сначала без недостающих обязательных, затем подходящие по срокам; иначе порядок как был', () => {
    const feed = [
      item('новое-60', 60, 0, null),
      item('70-не-по-срокам', 70, 0, false),
      item('70-по-срокам', 70, 0, true),
      item('70-без-обязательного', 70, 1, true),
      item('90', 90, 1, false),
      item('старое-60', 60, 0, null),
    ];
    expect([...feed].sort(compareForFeed).map((x) => x.key)).toEqual([
      '90',
      '70-по-срокам',
      '70-не-по-срокам',
      '70-без-обязательного',
      'новое-60',
      'старое-60',
    ]);
  });
});
