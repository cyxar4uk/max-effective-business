import { describe, expect, it } from 'vitest';
import { matchStudentToInternship } from '../matching/index.js';
import { DEMO_EMPLOYERS, DEMO_INTERNSHIPS, DEMO_INVITE_KEYS, DEMO_STUDENTS } from './demo/data.js';
import { INTERESTS_PER_INTERNSHIP, planDemoInterests } from './demo/plan.js';
import { pickDemoResponders, STRONG_SCORE } from './demo/responder.js';
import { TASK_TAGS } from './tags.js';
import { skillRows } from './skills.js';

const skillCodes = new Set(skillRows().map((r) => r.code));
const unique = <T>(xs: T[]) => new Set(xs).size === xs.length;
const PHONE = /^\+7000000\d{4}$/;

describe('демо-данные: объём и ключи', () => {
  it('объём по плану', () => {
    expect(DEMO_EMPLOYERS).toHaveLength(12);
    expect(DEMO_INTERNSHIPS.length).toBeGreaterThanOrEqual(20);
    expect(DEMO_INTERNSHIPS.length).toBeLessThanOrEqual(30);
    expect(DEMO_STUDENTS.length).toBeGreaterThanOrEqual(50);
    expect(DEMO_STUDENTS.length).toBeLessThanOrEqual(60);
  });

  it('max_user_id отрицательные и уникальные — не пересекаются с настоящими пользователями MAX', () => {
    const ids = [...DEMO_EMPLOYERS, ...DEMO_STUDENTS].map((u) => u.maxUserId);
    expect(unique(ids)).toBe(true);
    for (const id of ids) expect(id).toBeLessThan(0);
  });

  it('ключи уникальны, у каждой стажировки есть работодатель, у каждого работодателя — стажировка', () => {
    expect(unique(DEMO_EMPLOYERS.map((e) => e.key))).toBe(true);
    expect(unique(DEMO_INTERNSHIPS.map((i) => i.key))).toBe(true);
    expect(unique(DEMO_STUDENTS.map((s) => s.key))).toBe(true);
    const employers = new Set(DEMO_EMPLOYERS.map((e) => e.key));
    for (const i of DEMO_INTERNSHIPS) expect(employers.has(i.employer)).toBe(true);
    for (const e of DEMO_EMPLOYERS) expect(DEMO_INTERNSHIPS.some((i) => i.employer === e.key)).toBe(true);
  });

  it('телефоны заведомо тестовые и уникальные', () => {
    const phones = [...DEMO_EMPLOYERS, ...DEMO_STUDENTS].map((u) => u.phone);
    expect(unique(phones)).toBe(true);
    for (const p of phones) expect(p).toMatch(PHONE);
  });
});

describe('демо-данные: те же правила, что у API и БД', () => {
  it('стажировки: навыки из справочника, обязательные есть, без пересечения, город для очных, даты по порядку', () => {
    for (const i of DEMO_INTERNSHIPS) {
      expect(i.requiredSkills.length, i.key).toBeGreaterThan(0);
      for (const s of [...i.requiredSkills, ...i.niceSkills]) expect(skillCodes.has(s), `${i.key}: ${s}`).toBe(true);
      expect(i.niceSkills.some((s) => i.requiredSkills.includes(s)), i.key).toBe(false);
      if (i.format !== 'remote') expect(i.city, i.key).toBeTruthy();
      expect(i.endsOn >= i.startsOn, i.key).toBe(true);
      expect(i.slots).toBeGreaterThanOrEqual(1);
      expect(i.title.length).toBeLessThanOrEqual(200);
    }
  });

  it('студенты: навыки из справочника без повторов, курс 1–6, хотя бы один формат', () => {
    for (const s of DEMO_STUDENTS) {
      for (const code of s.skills) expect(skillCodes.has(code), `${s.key}: ${code}`).toBe(true);
      expect(unique(s.skills), s.key).toBe(true);
      expect(s.skills.length).toBeLessThanOrEqual(30);
      expect(s.course).toBeGreaterThanOrEqual(1);
      expect(s.course).toBeLessThanOrEqual(6);
      expect(s.formats.length).toBeGreaterThan(0);
    }
  });
});

describe('демо-данные: разный процент у каждой стажировки', () => {
  it.each(DEMO_INTERNSHIPS.map((i) => [i.key, i] as const))('%s: есть подходящие кандидаты с ≥ 80, 60–79 и < 60', (_key, internship) => {
    const scores = DEMO_STUDENTS.map((s) => matchStudentToInternship(s, internship))
      .filter((r) => r.passesFilters)
      .map((r) => r.score);
    expect(scores.some((x) => x >= 80)).toBe(true);
    expect(scores.some((x) => x >= 60 && x < 80)).toBe(true);
    expect(scores.some((x) => x < 60)).toBe(true);
  });

  it('есть студенты, которые не проходят фильтры по городу и по формату', () => {
    const failures = DEMO_STUDENTS.flatMap((s) => DEMO_INTERNSHIPS.flatMap((i) => matchStudentToInternship(s, i).filterFailures));
    expect(failures).toContain('city');
    expect(failures).toContain('format');
  });

  it('у нового студента из Москвы с базовыми навыками лента не пустая', () => {
    const newcomer = { skills: ['excel', 'copywriting', 'smm'], formats: ['remote' as const], city: 'Москва' };
    const feed = DEMO_INTERNSHIPS.map((i) => matchStudentToInternship(newcomer, i)).filter((r) => r.passesFilters);
    expect(feed.length).toBeGreaterThanOrEqual(10);
  });
});

describe('демо-отклики на место проверяющего под типовую задачу (#64)', () => {
  // Проверяющий выбирает тег в форме места: тег подставляет свои навыки обязательными (formSteps.tsx), желательных нет.
  // Москва, гибрид — самый частый случай; порог уведомления — 60 %.
  const candidates = DEMO_STUDENTS.map((s, i) => ({ userId: i + 1, skills: s.skills, formats: s.formats, city: s.city }));
  const placeFor = (skills: string[]) => ({ requiredSkills: skills, niceSkills: [], format: 'hybrid' as const, city: 'Москва' });

  it.each(['marketplaces', 'website', 'spreadsheets', 'social_ads', 'one_c'])('%s: не меньше 4 откликов, из них не меньше 2 от 80 %%', (code) => {
    const tag = TASK_TAGS.find((t) => t.code === code)!;
    const picked = pickDemoResponders(placeFor(tag.skills), candidates, 60);
    expect(picked.length).toBeGreaterThanOrEqual(4);
    expect(picked.filter((p) => p.match.score >= STRONG_SCORE).length).toBeGreaterThanOrEqual(2);
    // Кроме сильных, есть и кандидат с пробелами — видно, чего не хватает
    expect(picked.some((p) => p.match.score < STRONG_SCORE)).toBe(true);
  });

  it('sales: хотя бы два отклика, один от 80 %', () => {
    const tag = TASK_TAGS.find((t) => t.code === 'sales')!;
    const picked = pickDemoResponders(placeFor(tag.skills), candidates, 60);
    expect(picked.length).toBeGreaterThanOrEqual(2);
    expect(picked.some((p) => p.match.score >= STRONG_SCORE)).toBe(true);
  });
});

describe('демо-места: занятость в описании (#64)', () => {
  it('у каждого места указана занятость — «25 000 ₽» не читается как полный день ниже МРОТ', () => {
    for (const i of DEMO_INTERNSHIPS) expect(i.description, i.key).toMatch(/часов в неделю/);
  });
});

describe('planDemoInterests', () => {
  const interests = planDemoInterests(DEMO_INTERNSHIPS, DEMO_STUDENTS, DEMO_INVITE_KEYS);

  it('у каждой стажировки есть отклики, не больше трёх, все — от подходящих студентов с совпадением ≥ 60', () => {
    for (const i of DEMO_INTERNSHIPS) {
      const own = interests.filter((x) => x.internship === i.key);
      expect(own.length, i.key).toBeGreaterThanOrEqual(2);
      expect(own.length).toBeLessThanOrEqual(INTERESTS_PER_INTERNSHIP);
      for (const x of own) {
        expect(x.match.passesFilters).toBe(true);
        expect(x.match.score).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('пара студент + стажировка не повторяется', () => {
    expect(unique(interests.map((x) => `${x.student}:${x.internship}`))).toBe(true);
  });

  it('в стажировках со статусами: первый приглашён, третий получил отказ; в остальных — только «интересно»', () => {
    for (const key of DEMO_INVITE_KEYS) {
      const own = interests.filter((x) => x.internship === key).map((x) => x.status);
      expect(own, key).toEqual(['invited', 'interested', 'declined']);
    }
    const rest = interests.filter((x) => !DEMO_INVITE_KEYS.includes(x.internship));
    expect(rest.every((x) => x.status === 'interested')).toBe(true);
  });

  it('детерминирован: два вызова дают одно и то же', () => {
    expect(planDemoInterests(DEMO_INTERNSHIPS, DEMO_STUDENTS, DEMO_INVITE_KEYS)).toEqual(interests);
  });
});

describe('демо-места: тип и оплата (#74)', () => {
  // МРОТ 2026 — 27 093 ₽ за полный месяц; у тестовых мест 20 часов в неделю, то есть половина ставки
  const MROT_2026 = 27_093;
  const HALF_TIME = 20 / 40;

  it('у каждого места есть тип и оплата: сумма у оплачиваемых, у остальных — «без оплаты»', () => {
    for (const i of DEMO_INTERNSHIPS) {
      expect(['practice', 'internship', 'part_time'], i.key).toContain(i.type);
      expect(typeof i.paid, i.key).toBe('boolean');
      if (i.paid) expect(i.salary, i.key).toBeGreaterThan(0);
      else expect(i.salary, i.key).toBeNull();
    }
  });

  it('оплата не ниже МРОТ за отработанную долю ставки, и часы в описании это подтверждают', () => {
    for (const i of DEMO_INTERNSHIPS.filter((x) => x.paid)) {
      expect(i.description, i.key).toMatch(/20 часов в неделю/);
      expect(i.salary!, i.key).toBeGreaterThanOrEqual(Math.ceil(MROT_2026 * HALF_TIME));
    }
  });

  it('смесь: практики без оплаты, оплачиваемые стажировки и одна-две подработки', () => {
    const count = (f: (i: (typeof DEMO_INTERNSHIPS)[number]) => boolean) => DEMO_INTERNSHIPS.filter(f).length;
    expect(count((i) => i.type === 'practice' && !i.paid)).toBeGreaterThanOrEqual(5);
    expect(count((i) => i.type === 'internship' && i.paid)).toBeGreaterThanOrEqual(10);
    const partTime = count((i) => i.type === 'part_time');
    expect(partTime).toBeGreaterThanOrEqual(1);
    expect(partTime).toBeLessThanOrEqual(2);
    // Место для типовой задачи малого бизнеса, которое проверяющий видит первым, — оплачиваемое
    expect(DEMO_INTERNSHIPS.find((i) => i.key === 'b1')?.paid).toBe(true);
  });
});
