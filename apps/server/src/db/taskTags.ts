// Загрузка справочника тегов задач в task_tags. Данные — TASK_TAGS из seed/tags.ts (Тимур).
// Грузится при каждом старте, как справочник навыков: без него теги в форме места не сохранить.
// Порядок — как в массиве. Теги, пропавшие из списка, не удаляем: на них могут ссылаться места.

type Query = (sql: string, params?: unknown[]) => Promise<unknown>;

export interface TaskTagRow {
  code: string;
  name: string;
  skills: readonly string[];
}

export async function loadTaskTags(db: { query: Query }, tags: readonly TaskTagRow[]): Promise<number> {
  if (tags.length === 0) return 0;
  const values = tags.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}::text[])`).join(', ');
  await db.query(
    `INSERT INTO task_tags (code, name, sort, skills) VALUES ${values}
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort = EXCLUDED.sort, skills = EXCLUDED.skills`,
    tags.flatMap((t, i) => [t.code, t.name, (i + 1) * 10, [...t.skills]]),
  );
  return tags.length;
}
