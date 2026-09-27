import { describe, expect, it } from 'vitest';
import { SKILL_GROUPS, seedSkills, skillRows } from './skills.js';

describe('справочник навыков', () => {
  const rows = skillRows();

  it('60–100 навыков', () => {
    expect(rows.length).toBeGreaterThanOrEqual(60);
    expect(rows.length).toBeLessThanOrEqual(100);
  });

  it('коды уникальны и в формате [a-z0-9_]', () => {
    const codes = rows.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[a-z0-9_]+$/);
  });

  it('названия уникальны, непустые и не длиннее 40 символов', () => {
    const names = rows.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.trim()).toBe(name);
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(40);
    }
  });

  it('в каждой группе 4–12 навыков, группы не повторяются', () => {
    expect(new Set(SKILL_GROUPS.map((g) => g.group)).size).toBe(SKILL_GROUPS.length);
    for (const g of SKILL_GROUPS) {
      expect(g.skills.length).toBeGreaterThanOrEqual(4);
      expect(g.skills.length).toBeLessThanOrEqual(12);
    }
  });

  it('sort — порядок внутри группы с шагом 10', () => {
    expect(skillRows([{ group: 'Г', skills: [{ code: 'a', name: 'A' }, { code: 'b', name: 'B' }] }])).toEqual([
      { code: 'a', name: 'A', groupName: 'Г', sort: 10 },
      { code: 'b', name: 'B', groupName: 'Г', sort: 20 },
    ]);
  });
});

describe('seedSkills', () => {
  it('один запрос с upsert по коду и параметрами по четыре на навык', async () => {
    const calls: { sql: string; params?: unknown[] }[] = [];
    const db = { query: async (sql: string, params?: unknown[]) => void calls.push({ sql, params }) };

    const n = await seedSkills(db, [
      { code: 'excel', name: 'Excel', groupName: 'Аналитика', sort: 10 },
      { code: 'sql', name: 'SQL', groupName: 'Аналитика', sort: 20 },
    ]);

    expect(n).toBe(2);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.sql).toContain('VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)');
    expect(calls[0]!.sql).toContain('ON CONFLICT (code) DO UPDATE');
    expect(calls[0]!.params).toEqual(['excel', 'Excel', 'Аналитика', 10, 'sql', 'SQL', 'Аналитика', 20]);
  });

  it('пустой список — без запроса', async () => {
    let called = false;
    expect(await seedSkills({ query: async () => void (called = true) }, [])).toBe(0);
    expect(called).toBe(false);
  });
});
