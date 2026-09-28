import { describe, expect, it } from 'vitest';
import { SKILL_GROUPS, seedSkills, skillRows } from './skills.js';
import { TASK_TAGS } from './tags.js';

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

  it('sort сквозной: группа × 100 + позиция × 5', () => {
    expect(
      skillRows([
        { group: 'Г1', skills: [{ code: 'a', name: 'A' }, { code: 'b', name: 'B' }] },
        { group: 'Г2', skills: [{ code: 'c', name: 'C' }] },
      ]),
    ).toEqual([
      { code: 'a', name: 'A', groupName: 'Г1', sort: 105 },
      { code: 'b', name: 'B', groupName: 'Г1', sort: 110 },
      { code: 'c', name: 'C', groupName: 'Г2', sort: 205 },
    ]);
  });

  it('по sort группы идут в заданном порядке: «Маркетплейсы» — вторая', () => {
    const order = [...new Set([...rows].sort((x, y) => x.sort - y.sort).map((r) => r.groupName))];
    expect(order).toEqual(SKILL_GROUPS.map((g) => g.group));
    expect(order[1]).toBe('Маркетплейсы и онлайн-продажи');
  });

  it('правки Артёма 28.09: 84 навыка в 12 группах, коды существующих навыков на месте', () => {
    expect(rows).toHaveLength(84);
    expect(SKILL_GROUPS).toHaveLength(12);
    const names = new Map(rows.map((r) => [r.code, r.name]));
    expect(names.get('no_code')).toBe('Tilda и конструкторы сайтов');
    expect(names.get('web_analytics')).toBe('Веб-аналитика (Яндекс Метрика)');
    expect(names.get('context_ads')).toBe('Контекстная реклама (Яндекс Директ)');
    for (const code of ['marketplace_cards', 'wildberries', 'ozon', 'marketplace_analytics', 'unit_economics', 'avito', 'product_photo',
      'email_marketing', 'reviews_management', 'wordpress', 'chatbots', '1c_trade', '1c_zup', 'canva']) {
      expect(names.has(code), code).toBe(true);
    }
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

describe('теги задач', () => {
  const codes = new Set(skillRows().map((r) => r.code));

  it('коды тегов уникальны и в формате [a-z0-9_], названия непустые', () => {
    expect(new Set(TASK_TAGS.map((t) => t.code)).size).toBe(TASK_TAGS.length);
    for (const t of TASK_TAGS) {
      expect(t.code).toMatch(/^[a-z0-9_]+$/);
      expect(t.name.length).toBeGreaterThan(0);
    }
  });

  it('каждый тег подставляет навыки только из справочника, без повторов', () => {
    for (const t of TASK_TAGS) {
      expect(t.skills.length, t.code).toBeGreaterThan(0);
      expect(new Set(t.skills).size, t.code).toBe(t.skills.length);
      for (const s of t.skills) expect(codes.has(s), `${t.code}: ${s}`).toBe(true);
    }
  });
});
