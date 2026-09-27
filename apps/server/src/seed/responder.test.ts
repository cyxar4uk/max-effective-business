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

  it('при равном проценте порядок детерминирован', () => {
    const a = pickDemoResponders({ requiredSkills: ['excel'], niceSkills: [], format: 'remote', city: null }, candidates, 60);
    const b = pickDemoResponders({ requiredSkills: ['excel'], niceSkills: [], format: 'remote', city: null }, candidates, 60);
    expect(a).toEqual(b);
  });
});
