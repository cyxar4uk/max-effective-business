// Загрузка справочника и демо-данных на настоящем PostgreSQL. Запуск — как у сквозного теста:
//   TEST_DATABASE_URL=postgres://app:pass@localhost:5432/app_test npm test
// Тест работает в собственной схеме seed_demo_test и не трогает public, где идёт сквозной сценарий.
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataSource } from '../src/db/dataSource.js';
import { DEMO_EMPLOYERS, DEMO_INTERNSHIPS, DEMO_STUDENTS } from '../src/seed/demo/data.js';
import { seedDemo, seedSkills, skillRows } from '../src/seed/index.js';

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = 'seed_demo_test';

function withSearchPath(base: string): string {
  const u = new URL(base);
  u.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return u.toString();
}

describe.skipIf(!url)('загрузка демо-данных', () => {
  let ds: DataSource;
  const count = async (sql: string) => Number((await ds.query(sql))[0].n);

  beforeAll(async () => {
    const admin = createDataSource(url!);
    await admin.initialize();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`);
    await admin.destroy();

    ds = createDataSource(withSearchPath(url!));
    await ds.initialize();
    await ds.runMigrations();
  });

  afterAll(async () => {
    await ds?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await ds?.destroy();
  });

  it('первая загрузка создаёт всё и помечает как демо', async () => {
    await seedSkills(ds);
    const result = await seedDemo(ds);

    expect(await count('SELECT count(*) AS n FROM skills')).toBe(skillRows().length);
    expect(await count('SELECT count(*) AS n FROM users WHERE is_demo AND max_user_id < 0')).toBe(DEMO_EMPLOYERS.length + DEMO_STUDENTS.length);
    expect(await count('SELECT count(*) AS n FROM employers WHERE is_demo')).toBe(DEMO_EMPLOYERS.length);
    expect(await count(`SELECT count(*) AS n FROM internships WHERE is_demo AND source = 'demo'`)).toBe(DEMO_INTERNSHIPS.length);
    expect(await count('SELECT count(*) AS n FROM student_profiles WHERE is_demo')).toBe(DEMO_STUDENTS.length);
    expect(result.interests).toBeGreaterThan(0);
    expect(await count('SELECT count(*) AS n FROM interests WHERE is_demo')).toBe(result.interests);
    expect(await count(`SELECT count(DISTINCT status) AS n FROM interests`)).toBe(3);
  });

  it('повторная загрузка не плодит дубли и не откатывает действия проверяющего', async () => {
    const before = await count('SELECT count(*) AS n FROM interests');
    const [target] = await ds.query(`SELECT id FROM interests WHERE status = 'interested' ORDER BY id LIMIT 1`);
    await ds.query(`UPDATE interests SET status = 'invited' WHERE id = $1`, [target.id]);

    await seedSkills(ds);
    const again = await seedDemo(ds);

    expect(again.interests).toBe(0);
    expect(await count('SELECT count(*) AS n FROM interests')).toBe(before);
    expect(await count('SELECT count(*) AS n FROM users')).toBe(DEMO_EMPLOYERS.length + DEMO_STUDENTS.length);
    expect(await count('SELECT count(*) AS n FROM internships')).toBe(DEMO_INTERNSHIPS.length);
    expect(await count('SELECT count(*) AS n FROM skills')).toBe(skillRows().length);
    const [row] = await ds.query('SELECT status FROM interests WHERE id = $1', [target.id]);
    expect(row.status).toBe('invited');
  });
});
