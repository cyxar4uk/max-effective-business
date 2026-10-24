import { describe, expect, it } from 'vitest';
import { CLOSE_SKILL_PAIRS, CLOSE_SKILLS, closeSkillsMap, withCloseSkills } from './closeSkills.js';
import { skillRows } from './skills.js';

describe('близкие навыки (#71)', () => {
  const codes = new Set(skillRows().map((r) => r.code));
  const key = ([a, b]: readonly [string, string]) => [a, b].sort().join('~');

  it('25–40 пар: только очевидные, без английского B1 ~ B2 («B2 и выше» закрывает B1 целиком)', () => {
    expect(CLOSE_SKILL_PAIRS.length).toBeGreaterThanOrEqual(25);
    expect(CLOSE_SKILL_PAIRS.length).toBeLessThanOrEqual(40);
    expect(CLOSE_SKILL_PAIRS.map(key)).not.toContain(key(['english_b1', 'english_b2']));
  });

  it('все коды есть в справочнике', () => {
    for (const [a, b] of CLOSE_SKILL_PAIRS) {
      expect(codes.has(a), a).toBe(true);
      expect(codes.has(b), b).toBe(true);
    }
  });

  it('без пар навыка с самим собой и без повторов в любом порядке', () => {
    for (const [a, b] of CLOSE_SKILL_PAIRS) expect(a, a).not.toBe(b);
    const keys = CLOSE_SKILL_PAIRS.map(key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('примеры из задачи на месте', () => {
    for (const pair of [['excel', 'google_sheets'], ['wildberries', 'ozon'], ['no_code', 'wordpress'], ['smm', 'targeted_ads'], ['1c_accounting', '1c_trade']] as const) {
      expect(CLOSE_SKILL_PAIRS.map(key), pair.join('~')).toContain(key(pair));
    }
  });

  it('карта симметрична, пары навыка с собой и повторы отбрасываются', () => {
    expect(CLOSE_SKILLS.get('ozon')).toEqual(['wildberries', 'marketplace_cards']);
    expect(CLOSE_SKILLS.get('wildberries')).toEqual(['ozon', 'marketplace_cards']);
    for (const [from, list] of CLOSE_SKILLS) for (const to of list) expect(CLOSE_SKILLS.get(to), `${to} → ${from}`).toContain(from);
    expect(closeSkillsMap([['a', 'a'], ['a', 'b'], ['b', 'a']])).toEqual(new Map([['a', ['b']], ['b', ['a']]]));
  });

  it('withCloseSkills: навыки студента и близкие к ним без повторов', () => {
    expect(withCloseSkills(['excel', 'google_sheets', 'sql'])).toEqual(['excel', 'google_sheets', 'sql']);
    expect(withCloseSkills(['ozon'])).toEqual(['ozon', 'wildberries', 'marketplace_cards']);
    expect(withCloseSkills([])).toEqual([]);
  });
});
