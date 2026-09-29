import { describe, expect, it } from 'vitest';
import { DEMO_INTERNSHIPS } from './demo/data.js';
import { TASK_TAGS, tagsForSkills } from './tags.js';

describe('демо-места: теги для фильтра ленты', () => {
  it('по каждому тегу из фильтра находится хотя бы одно тестовое место', () => {
    const tagged = DEMO_INTERNSHIPS.flatMap((i) => tagsForSkills(i.requiredSkills));
    for (const t of TASK_TAGS) expect(tagged, t.code).toContain(t.code);
  });
});
