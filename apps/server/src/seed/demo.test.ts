import { describe, expect, it } from 'vitest';
import { matchStudentToInternship } from '../matching/index.js';
import { DEMO_EMPLOYERS, DEMO_INTERNSHIPS, DEMO_INVITE_KEYS, DEMO_STUDENTS } from './demo/data.js';
import { INTERESTS_PER_INTERNSHIP, planDemoInterests } from './demo/plan.js';
import { pickDemoResponders, STRONG_SCORE } from './demo/responder.js';
import { TASK_TAGS, tagsForSkills } from './tags.js';
import { skillRows } from './skills.js';

const skillCodes = new Set(skillRows().map((r) => r.code));
const unique = <T>(xs: T[]) => new Set(xs).size === xs.length;
const PHONE = /^\+7000000\d{4}$/;
const KZN = 'Казань';

describe('демо-данные: объём и ключи', () => {
  it('объём по плану: Москва и Казань (#99)', () => {
    const inKazan = <T extends { city: string | null }>(xs: T[]) => xs.filter((x) => x.city === KZN).length;
    expect(DEMO_EMPLOYERS).toHaveLength(16);
    expect(inKazan(DEMO_EMPLOYERS)).toBe(4);
    expect(DEMO_INTERNSHIPS.length).toBeGreaterThanOrEqual(30);
    expect(DEMO_INTERNSHIPS.length).toBeLessThanOrEqual(40);
    expect(inKazan(DEMO_INTERNSHIPS)).toBeGreaterThanOrEqual(7);
    expect(DEMO_STUDENTS.length).toBeGreaterThanOrEqual(60);
    expect(DEMO_STUDENTS.length).toBeLessThanOrEqual(75);
    expect(inKazan(DEMO_STUDENTS)).toBeGreaterThanOrEqual(15);
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
  // Проверяющий выбирает тег в форме места: тег подставляет первые два навыка обязательными, остальные — желательными
  // (formSteps.tsx, TAG_REQUIRED, #70). Критерий держим и для старого расклада «все обязательные»: работодатель может
  // перетащить навыки сам.
  // Москва, гибрид — самый частый случай; порог уведомления — 60 %.
  const candidates = DEMO_STUDENTS.map((s, i) => ({ userId: i + 1, skills: s.skills, formats: s.formats, city: s.city }));
  const layouts = {
    'два обязательных': (skills: string[]) => ({ requiredSkills: skills.slice(0, 2), niceSkills: skills.slice(2) }),
    'все обязательные': (skills: string[]) => ({ requiredSkills: skills, niceSkills: [] }),
  };
  const places = (skills: string[]) =>
    Object.entries(layouts).map(([name, f]) => [name, { ...f(skills), format: 'hybrid' as const, city: 'Москва' }] as const);

  it.each(['marketplaces', 'website', 'spreadsheets', 'social_ads', 'one_c'])('%s: не меньше 4 откликов, из них не меньше 2 от 80 %%', (code) => {
    const tag = TASK_TAGS.find((t) => t.code === code)!;
    for (const [layout, place] of places(tag.skills)) {
      const picked = pickDemoResponders(place, candidates, 60);
      expect(picked.length, layout).toBeGreaterThanOrEqual(4);
      expect(picked.filter((p) => p.match.score >= STRONG_SCORE).length, layout).toBeGreaterThanOrEqual(2);
      // Кроме сильных, есть и кандидат с пробелами — видно, чего не хватает
      expect(picked.some((p) => p.match.score < STRONG_SCORE), layout).toBe(true);
    }
  });

  it('sales: хотя бы два отклика, один от 80 %', () => {
    const tag = TASK_TAGS.find((t) => t.code === 'sales')!;
    for (const [layout, place] of places(tag.skills)) {
      const picked = pickDemoResponders(place, candidates, 60);
      expect(picked.length, layout).toBeGreaterThanOrEqual(2);
      expect(picked.some((p) => p.match.score >= STRONG_SCORE), layout).toBe(true);
    }
  });
});

describe('Казань (#99): финал там, и проверяющий из Казани видит места и отклики у себя', () => {
  const kazanPlaces = DEMO_INTERNSHIPS.filter((i) => i.city === KZN);

  it('места в Казани — очные и гибридные, на каждый тег задач малого бизнеса есть открытое', () => {
    for (const i of kazanPlaces) expect(['office', 'hybrid'], i.key).toContain(i.format);
    const openTags = new Set(kazanPlaces.filter((i) => !i.closed).flatMap((i) => tagsForSkills(i.requiredSkills)));
    for (const t of TASK_TAGS) expect(openTags.has(t.code), t.code).toBe(true);
  });

  it('у нового студента из Казани, который хочет очно или гибрид, лента не пустая', () => {
    const newcomer = { skills: ['excel', 'smm', 'copywriting', 'sales'], formats: ['office' as const, 'hybrid' as const], city: KZN };
    const feed = DEMO_INTERNSHIPS.filter((i) => !i.closed)
      .map((i) => matchStudentToInternship(newcomer, i))
      .filter((r) => r.passesFilters && r.score > 0);
    expect(feed.length).toBeGreaterThanOrEqual(4);
  });

  it('студенты в Казани — из КФУ, КНИТУ-КАИ и КГЭУ; в Москве есть ВШЭ и МГУ', () => {
    const universities = (city: string) => new Set(DEMO_STUDENTS.filter((s) => s.city === city).map((s) => s.university));
    for (const u of ['КФУ', 'КНИТУ-КАИ', 'КГЭУ']) expect(universities(KZN).has(u), u).toBe(true);
    for (const u of ['ВШЭ', 'МГУ']) expect(universities('Москва').has(u), u).toBe(true);
  });

  // Как для Москвы (#64): проверяющий публикует место с тегом, тег подставляет навыки. В Казани проверяем и очное,
  // и гибридное место — удалённое город не проверяет и уже покрыто московскими студентами.
  const candidates = DEMO_STUDENTS.map((s, i) => ({ userId: i + 1, skills: s.skills, formats: s.formats, city: s.city }));
  const cases = TASK_TAGS.flatMap((t) =>
    (['office', 'hybrid'] as const).flatMap((format) => [
      [`${t.code}, ${format}, два обязательных`, { requiredSkills: t.skills.slice(0, 2), niceSkills: t.skills.slice(2), format, city: KZN }] as const,
      [`${t.code}, ${format}, все обязательные`, { requiredSkills: t.skills, niceSkills: [], format, city: KZN }] as const,
    ]),
  );

  it.each(cases)('%s: не меньше 4 откликов, из них не меньше 2 от 80 %%', (_name, place) => {
    const picked = pickDemoResponders(place, candidates, 60);
    expect(picked.length).toBeGreaterThanOrEqual(4);
    expect(picked.filter((p) => p.match.score >= STRONG_SCORE).length).toBeGreaterThanOrEqual(2);
    expect(picked.some((p) => p.match.score < STRONG_SCORE)).toBe(true);
    // Откликаются казанцы: москвич на очное место в Казани не проходит фильтр города
    for (const p of picked) expect(candidates[p.userId - 1]!.city).toBe(KZN);
  });
});

describe('повторная загрузка на проде (#99)', () => {
  // На проде SEED_DEMO=true и база засеяна раньше: 12 работодателей, 28 мест, 52 студента. Отклики добавляются, но
  // не удаляются (load.ts), поэтому новые студенты не должны попадать в тройку откликов на старые места — иначе
  // повторная загрузка допишет четвёртого-пятого откликнувшегося и второго «приглашён».
  const LEGACY = { employers: 12, internships: 28, students: 52 };

  it('новые записи дописаны в конец, старые ключи на месте', () => {
    expect(DEMO_EMPLOYERS.slice(0, LEGACY.employers).every((e) => e.city === 'Москва')).toBe(true);
    expect(DEMO_INTERNSHIPS.slice(0, LEGACY.internships).map((i) => i.key)).toEqual(
      [...'a1 a2 a3 a4 a5 m1 m2 m3 m4 m5 f1 f2 f3 f4 l1 l2 l3 l4 h1 h2 h3 h4 i1 i2 i3 i4 b1 b2'.split(' ')],
    );
    expect(DEMO_STUDENTS.slice(0, LEGACY.students).map((s) => s.key)).toEqual(Array.from({ length: LEGACY.students }, (_, n) => `s${n + 1}`));
    expect(DEMO_INTERNSHIPS.slice(0, LEGACY.internships).some((i) => i.closed)).toBe(false);
  });

  it('отклики на старые места те же, что при прежнем составе студентов', () => {
    const legacyKeys = new Set(DEMO_INTERNSHIPS.slice(0, LEGACY.internships).map((i) => i.key));
    const before = planDemoInterests(DEMO_INTERNSHIPS.slice(0, LEGACY.internships), DEMO_STUDENTS.slice(0, LEGACY.students), DEMO_INVITE_KEYS);
    const after = planDemoInterests(DEMO_INTERNSHIPS, DEMO_STUDENTS, DEMO_INVITE_KEYS).filter((x) => legacyKeys.has(x.internship));
    expect(after).toEqual(before);
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

  it('у каждого места есть тип и оплата: сумма у оплачиваемых (или «Оплачивается» без суммы), у остальных — «без оплаты»', () => {
    for (const i of DEMO_INTERNSHIPS) {
      expect(['practice', 'internship', 'part_time'], i.key).toContain(i.type);
      expect(typeof i.paid, i.key).toBe('boolean');
      if (i.paid && i.salary !== null) expect(i.salary, i.key).toBeGreaterThan(0);
      if (!i.paid) expect(i.salary, i.key).toBeNull();
    }
    // Без суммы — одно-два места (#99): чтобы было видно, как выглядит «Оплачивается», но это не стало нормой
    const noSum = DEMO_INTERNSHIPS.filter((i) => i.paid && i.salary === null).length;
    expect(noSum).toBeGreaterThanOrEqual(1);
    expect(noSum).toBeLessThanOrEqual(2);
  });

  it('оплата не ниже МРОТ за отработанную долю ставки, и часы в описании это подтверждают', () => {
    for (const i of DEMO_INTERNSHIPS.filter((x) => x.paid)) {
      expect(i.description, i.key).toMatch(/20 часов в неделю/);
      if (i.salary !== null) expect(i.salary, i.key).toBeGreaterThanOrEqual(Math.ceil(MROT_2026 * HALF_TIME));
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
    // Оплачиваемая практика тоже бывает (#99)
    expect(count((i) => i.type === 'practice' && i.paid)).toBeGreaterThanOrEqual(1);
  });

  it('есть место со стартом в феврале–марте 2027 — для тех, кто ищет практику на весну (#99)', () => {
    expect(DEMO_INTERNSHIPS.some((i) => i.startsOn >= '2027-02-01' && i.startsOn <= '2027-03-31')).toBe(true);
  });

  it('одно место закрыто, и на нём есть отклики и приглашение (#99)', () => {
    const closed = DEMO_INTERNSHIPS.filter((i) => i.closed);
    expect(closed).toHaveLength(1);
    // Отклики на нём есть, кто-то приглашён — набор закрыли не впустую
    expect(DEMO_INVITE_KEYS).toContain(closed[0]!.key);
  });
});
