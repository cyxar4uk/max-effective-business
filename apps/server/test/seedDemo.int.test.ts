// Загрузка справочника и демо-данных на настоящем PostgreSQL. Запуск — как у сквозного теста:
//   TEST_DATABASE_URL=postgres://app:pass@localhost:5432/app_test npm test
// Тест работает в собственной схеме seed_demo_test и не трогает public, где идёт сквозной сценарий.
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataSource } from '../src/db/dataSource.js';
import { DEMO_EMPLOYERS, DEMO_INTERNSHIPS, DEMO_STUDENTS } from '../src/seed/demo/data.js';
import { respondWithDemoStudents, seedDemo, seedSkills, skillRows } from '../src/seed/index.js';

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
    // Теги для фильтра ленты: у мест с навыками задач малого бизнеса они есть
    expect(await count(`SELECT count(*) AS n FROM internships WHERE source = 'demo' AND tags && '{marketplaces}'`)).toBeGreaterThan(0);
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

  it('на стажировку проверяющего откликаются демо-студенты, повторно — без дублей; на демо-стажировку — нет', async () => {
    const [user] = await ds.query(`INSERT INTO users (max_user_id, first_name) VALUES (777, 'Проверяющий') RETURNING id`);
    const [employer] = await ds.query(
      `INSERT INTO employers (owner_user_id, company_name, city, contact_name) VALUES ($1, 'Моя компания', 'Москва', 'Проверяющий') RETURNING id`,
      [user.id],
    );
    const [internship] = await ds.query(
      `INSERT INTO internships (employer_id, title, required_skills, nice_skills, format) VALUES ($1, 'Аналитик', '{excel,sql}', '{power_bi}', 'remote') RETURNING id`,
      [employer.id],
    );

    const created = await respondWithDemoStudents(ds, internship.id, 60);
    expect(created).toBeGreaterThan(0);
    const rows: { status: string; is_demo: boolean; match_score: number }[] = await ds.query(
      'SELECT status, is_demo, match_score FROM interests WHERE internship_id = $1',
      [internship.id],
    );
    expect(rows).toHaveLength(created);
    for (const r of rows) {
      expect(r.status).toBe('interested');
      expect(r.is_demo).toBe(true);
      expect(r.match_score).toBeGreaterThanOrEqual(60);
    }

    expect(await respondWithDemoStudents(ds, internship.id, 60)).toBe(0);

    const [demo] = await ds.query(`SELECT id FROM internships WHERE source = 'demo' ORDER BY id LIMIT 1`);
    const before = await count('SELECT count(*) AS n FROM interests');
    expect(await respondWithDemoStudents(ds, demo.id, 60)).toBe(0);
    expect(await count('SELECT count(*) AS n FROM interests')).toBe(before);
  });
});
