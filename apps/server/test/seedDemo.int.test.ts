// Загрузка справочника и демо-данных на настоящем PostgreSQL. Запуск — как у сквозного теста:
//   TEST_DATABASE_URL=postgres://app:pass@localhost:5432/app_test npm test
// Тест работает в собственной схеме seed_demo_test и не трогает public, где идёт сквозной сценарий.
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataSource } from '../src/db/dataSource.js';
import { DEMO_EMPLOYERS, DEMO_INTERNSHIPS, DEMO_INVITE_KEYS, DEMO_STUDENTS } from '../src/seed/demo/data.js';
import { respondWithDemoStudents, seedDemo, seedSkills, skillRows } from '../src/seed/index.js';

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = 'seed_demo_test';
const UPGRADE_SCHEMA = 'seed_demo_upgrade_test';

function withSearchPath(base: string, schema: string = SCHEMA): string {
  const u = new URL(base);
  u.searchParams.set('options', `-c search_path=${schema}`);
  return u.toString();
}

async function freshSchema(schema: string): Promise<DataSource> {
  const admin = createDataSource(url!);
  await admin.initialize();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};`);
  await admin.destroy();

  const ds = createDataSource(withSearchPath(url!, schema));
  await ds.initialize();
  await ds.runMigrations();
  return ds;
}

describe.skipIf(!url)('загрузка демо-данных', () => {
  let ds: DataSource;
  const count = async (sql: string) => Number((await ds.query(sql))[0].n);

  beforeAll(async () => {
    ds = await freshSchema(SCHEMA);
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
    // Тип и оплата у всех тестовых мест (#74): в карточке нет «оплата не указана»
    expect(await count(`SELECT count(*) AS n FROM internships WHERE source = 'demo' AND paid IS NULL`)).toBe(0);
    // Оплачиваемые без суммы — только те, что задуманы так в data.ts (#99): в карточке «Оплачивается»
    expect(await count(`SELECT count(*) AS n FROM internships WHERE source = 'demo' AND paid AND salary IS NULL`)).toBe(
      DEMO_INTERNSHIPS.filter((i) => i.paid && i.salary === null).length,
    );
    expect(await count(`SELECT count(*) AS n FROM internships WHERE source = 'demo' AND status = 'closed'`)).toBe(
      DEMO_INTERNSHIPS.filter((i) => i.closed).length,
    );
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

// На проде SEED_DEMO=true и база засеяна прежним составом; сид запускается при каждом старте сервера (#99).
describe.skipIf(!url)('загрузка демо-данных поверх прежнего состава', () => {
  let ds: DataSource;
  const count = async (sql: string) => Number((await ds.query(sql))[0].n);
  const LEGACY = {
    employers: DEMO_EMPLOYERS.slice(0, 12),
    internships: DEMO_INTERNSHIPS.slice(0, 28),
    students: DEMO_STUDENTS.slice(0, 52),
    inviteKeys: DEMO_INVITE_KEYS,
  };
  // Отклики на старые места: место, студент, статус
  const legacyInterests = async (): Promise<string[]> =>
    (
      await ds.query(
        `SELECT i.source_id, u.max_user_id, x.status FROM interests x
           JOIN internships i ON i.id = x.internship_id JOIN users u ON u.id = x.student_user_id
          WHERE i.source_id = ANY($1) ORDER BY 1, 2`,
        [LEGACY.internships.map((i) => `demo_${i.key}`)],
      )
    ).map((r: { source_id: string; max_user_id: string; status: string }) => `${r.source_id}:${r.max_user_id}:${r.status}`);

  beforeAll(async () => {
    ds = await freshSchema(UPGRADE_SCHEMA);
    await seedSkills(ds);
    await seedDemo(ds, LEGACY);
  });

  afterAll(async () => {
    await ds?.query(`DROP SCHEMA IF EXISTS ${UPGRADE_SCHEMA} CASCADE`);
    await ds?.destroy();
  });

  it('добавляет Казань и новых студентов, старые записи и отклики не трогает', async () => {
    // Проверяющий успел пригласить демо-студента на старое место
    const [target] = await ds.query(`SELECT id FROM interests WHERE status = 'interested' ORDER BY id LIMIT 1`);
    await ds.query(`UPDATE interests SET status = 'invited' WHERE id = $1`, [target.id]);
    const before = await legacyInterests();
    const ids = await ds.query(`SELECT id, source_id FROM internships ORDER BY id`);

    const result = await seedDemo(ds);

    expect(result.interests).toBeGreaterThan(0);
    expect(await legacyInterests()).toEqual(before);
    // Старые места не пересоздаются: id те же
    expect(await ds.query(`SELECT id, source_id FROM internships WHERE source_id = ANY($1) ORDER BY id`, [ids.map((r: { source_id: string }) => r.source_id)])).toEqual(ids);
    expect(await count('SELECT count(*) AS n FROM users WHERE is_demo')).toBe(DEMO_EMPLOYERS.length + DEMO_STUDENTS.length);
    expect(await count('SELECT count(*) AS n FROM employers WHERE is_demo')).toBe(DEMO_EMPLOYERS.length);
    expect(await count('SELECT count(*) AS n FROM internships')).toBe(DEMO_INTERNSHIPS.length);
    expect(await count('SELECT count(*) AS n FROM student_profiles')).toBe(DEMO_STUDENTS.length);
    expect(await count(`SELECT count(*) AS n FROM internships WHERE city = 'Казань' AND format IN ('office', 'hybrid')`)).toBe(
      DEMO_INTERNSHIPS.filter((i) => i.city === 'Казань').length,
    );
    // У каждого нового места есть отклики
    expect(
      await count(
        `SELECT count(*) AS n FROM internships i WHERE NOT EXISTS (SELECT 1 FROM interests x WHERE x.internship_id = i.id)`,
      ),
    ).toBe(0);
  });

  it('следующий запуск ничего не добавляет и статусы мест не трогает', async () => {
    const closedKey = DEMO_INTERNSHIPS.find((i) => i.closed)!.key;
    const openKey = DEMO_INTERNSHIPS.find((i) => !i.closed)!.key;
    const statusOf = async (key: string) => (await ds.query(`SELECT status FROM internships WHERE source_id = $1`, [`demo_${key}`]))[0].status;
    expect(await statusOf(closedKey)).toBe('closed');
    // Статусы, поменянные вручную после первой загрузки: повторная загрузка не должна их откатить
    await ds.query(`UPDATE internships SET status = 'open' WHERE source_id = $1`, [`demo_${closedKey}`]);
    await ds.query(`UPDATE internships SET status = 'closed' WHERE source_id = $1`, [`demo_${openKey}`]);
    const interests = await count('SELECT count(*) AS n FROM interests');

    const again = await seedDemo(ds);

    expect(again.interests).toBe(0);
    expect(await count('SELECT count(*) AS n FROM interests')).toBe(interests);
    expect(await count('SELECT count(*) AS n FROM users')).toBe(DEMO_EMPLOYERS.length + DEMO_STUDENTS.length);
    expect(await statusOf(closedKey)).toBe('open');
    expect(await statusOf(openKey)).toBe('closed');
  });
});
