import { describe, expect, it } from 'vitest';
import { DEMO_STUDENTS } from './demo/data.js';
import { DEMO_RESPONSES_LIMIT, pickDemoResponders, type DemoCandidate } from './demo/responder.js';

const candidates: DemoCandidate[] = DEMO_STUDENTS.map((s, i) => ({ userId: i + 1, skills: s.skills, formats: s.formats, city: s.city }));

describe('pickDemoResponders', () => {
  it('на типичную стажировку проверяющего откликаются демо-студенты, не больше лимита, по убыванию процента', () => {
    const picked = pickDemoResponders({ requiredSkills: ['excel'], niceSkills: ['sql'], format: 'remote', city: null }, candidates, 60);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.length).toBeLessThanOrEqual(DEMO_RESPONSES_LIMIT);
    const scores = picked.map((p) => p.match.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const p of picked) {
      expect(p.match.passesFilters).toBe(true);
      expect(p.match.score).toBeGreaterThanOrEqual(60);
    }
  });

  it('очная стажировка в Москве — только студенты, которым подходят город и формат', () => {
    const picked = pickDemoResponders({ requiredSkills: ['excel'], niceSkills: [], format: 'office', city: 'Москва' }, candidates, 60);
    const byId = new Map(candidates.map((c) => [c.userId, c]));
    for (const p of picked) {
      const c = byId.get(p.userId)!;
      expect(c.city).toBe('Москва');
      expect(c.formats).toContain('office');
    }
  });

  it('никто не подходит — откликов нет', () => {
    expect(pickDemoResponders({ requiredSkills: ['agronomy', 'chinese'], niceSkills: [], format: 'remote', city: null }, candidates, 60)).toEqual([]);
  });

  it('порог из конфига учитывается', () => {
    const low = pickDemoResponders({ requiredSkills: ['excel', 'sql'], niceSkills: [], format: 'remote', city: null }, candidates, 50, 100);
    const high = pickDemoResponders({ requiredSkills: ['excel', 'sql'], niceSkills: [], format: 'remote', city: null }, candidates, 100, 100);
    expect(low.length).toBeGreaterThan(high.length);
    expect(high.every((p) => p.match.score === 100)).toBe(true);
  });

  it('очная стажировка в Казани (город финала) — кандидаты есть, все из Казани', () => {
    const picked = pickDemoResponders({ requiredSkills: ['excel'], niceSkills: [], format: 'office', city: 'Казань' }, candidates, 60);
    expect(picked.length).toBeGreaterThanOrEqual(3);
    const byId = new Map(candidates.map((c) => [c.userId, c]));
    for (const p of picked) expect(byId.get(p.userId)!.city).toBe('Казань');
  });

  it('очная в Петербурге — тоже не пусто', () => {
    const picked = pickDemoResponders({ requiredSkills: ['excel'], niceSkills: ['sales'], format: 'office', city: 'Санкт-Петербург' }, candidates, 60);
    expect(picked.length).toBeGreaterThan(0);
  });

  it('если есть кандидаты с пробелами, в выдаче не одни стопроцентные — видна расшифровка', () => {
    const picked = pickDemoResponders({ requiredSkills: ['excel', 'sql'], niceSkills: ['power_bi', 'statistics'], format: 'remote', city: null }, candidates, 60);
    expect(picked.length).toBeGreaterThanOrEqual(3);
    expect(picked.some((p) => p.match.score >= 80)).toBe(true);
    const partial = picked.filter((p) => p.match.score < 80);
    expect(partial.length).toBeGreaterThanOrEqual(1);
    expect(partial.length).toBeLessThanOrEqual(2);
    expect(partial.every((p) => p.match.mustMissing.length + p.match.niceMissing.length > 0)).toBe(true);
  });

  it('одной группы не хватает — добираем другой', () => {
    const s = (userId: number, skills: string[]): DemoCandidate => ({ userId, skills, formats: ['remote'], city: 'Москва' });
    const internship = { requiredSkills: ['a', 'b', 'c'], niceSkills: [], format: 'remote' as const, city: null };
    // только «с пробелами» (2 из 3 = 67 %) — берём до лимита
    const onlyPartial = pickDemoResponders(internship, [1, 2, 3, 4, 5, 6].map((id) => s(id, ['a', 'b'])), 60);
    expect(onlyPartial).toHaveLength(5);
    // только сильные — тоже до лимита
    const onlyStrong = pickDemoResponders(internship, [1, 2, 3, 4, 5, 6].map((id) => s(id, ['a', 'b', 'c'])), 60);
    expect(onlyStrong).toHaveLength(5);
    // 6 сильных и 1 с пробелами — 4 + 1
    const mixed = pickDemoResponders(internship, [...[1, 2, 3, 4, 5, 6].map((id) => s(id, ['a', 'b', 'c'])), s(7, ['a', 'b'])], 60);
    expect(mixed.map((p) => p.match.score)).toEqual([100, 100, 100, 100, 67]);
  });

  it('при равном проценте порядок детерминирован', () => {
    const a = pickDemoResponders({ requiredSkills: ['excel'], niceSkills: [], format: 'remote', city: null }, candidates, 60);
    const b = pickDemoResponders({ requiredSkills: ['excel'], niceSkills: [], format: 'remote', city: null }, candidates, 60);
    expect(a).toEqual(b);
  });
});
