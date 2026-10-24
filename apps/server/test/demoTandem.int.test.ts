// Интеграционный тест демо-режима (#100): демо-компания сама приглашает проверяющего-студента,
// а на место проверяющего-работодателя после демо-откликов приходит одно событие для бота.
// Нужен PostgreSQL: TEST_DATABASE_URL, своя схема.
import pino from 'pino';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataSource } from '../src/db/dataSource.js';
import { EventBus, type AppEvents } from '../src/events.js';
import { inviteForDemoEmployer, inviteRecentForDemoEmployers, registerDemoResponder, seedDemo, seedSkills } from '../src/seed/index.js';

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = 'demo_tandem_test';

function withSearchPath(base: string): string {
  const u = new URL(base);
  u.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return u.toString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await sleep(20);
};

describe.skipIf(!url)('демо-тандем', () => {
  let ds: DataSource;
  let demoPlaces: number[];
  let realEmployer: number;
  let nextMaxId = 700;

  const newStudent = async () => Number((await ds.query(`INSERT INTO users (max_user_id, first_name) VALUES ($1, 'Проверяющий') RETURNING id`, [nextMaxId++]))[0].id);

  /** Отклик студента на место с заданным процентом. */
  const interest = async (studentId: number, internshipId: number, score: number, status = 'interested', interestedAt = 'now()') => {
    const [row] = await ds.query(
      `INSERT INTO interests (student_user_id, internship_id, status, match_score, match, interested_at)
       VALUES ($1, $2, $3, $4, '{}'::jsonb, ${interestedAt}) RETURNING id`,
      [studentId, internshipId, status, score],
    );
    return Number(row.id);
  };
  const statusOf = async (id: number) => (await ds.query('SELECT status FROM interests WHERE id = $1', [id]))[0].status as string;

  beforeAll(async () => {
    const admin = createDataSource(url!);
    await admin.initialize();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`);
    await admin.destroy();

    ds = createDataSource(withSearchPath(url!));
    await ds.initialize();
    await ds.runMigrations();
    await seedSkills(ds);
    await seedDemo(ds);

    demoPlaces = (await ds.query(`SELECT id FROM internships WHERE source = 'demo' AND status = 'open' ORDER BY id LIMIT 6`)).map((r: { id: string }) => Number(r.id));
    const owner = await newStudent();
    realEmployer = Number(
      (await ds.query(`INSERT INTO employers (owner_user_id, company_name, city, contact_name) VALUES ($1, 'Живая', 'Казань', 'Ирина') RETURNING id`, [owner]))[0].id,
    );
  });

  afterAll(async () => {
    await ds?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await ds?.destroy();
  });

  it('совпадение от 70 % на открытом демо-месте — приглашает, повтор ничего не меняет', async () => {
    const id = await interest(await newStudent(), demoPlaces[0]!, 85);
    expect(await inviteForDemoEmployer(ds, id)).toBe(true);
    expect(await statusOf(id)).toBe('invited');
    expect(await inviteForDemoEmployer(ds, id)).toBe(false);
  });

  it('второе демо-приглашение тому же студенту за сутки — нет', async () => {
    const s = await newStudent();
    expect(await inviteForDemoEmployer(ds, await interest(s, demoPlaces[0]!, 90))).toBe(true);
    const second = await interest(s, demoPlaces[1]!, 90);
    expect(await inviteForDemoEmployer(ds, second)).toBe(false);
    expect(await statusOf(second)).toBe('interested');
  });

  it('DEMO_INVITE_COOLDOWN_HOURS: 0 — без ограничения, иначе считается от заданного числа часов', async () => {
    const s = await newStudent();
    const first = await interest(s, demoPlaces[0]!, 90);
    expect(await inviteForDemoEmployer(ds, first)).toBe(true);
    // Без кулдауна второе приглашение сразу проходит
    expect(await inviteForDemoEmployer(ds, await interest(s, demoPlaces[1]!, 90), { cooldownHours: 0 })).toBe(true);

    const s2 = await newStudent();
    expect(await inviteForDemoEmployer(ds, await interest(s2, demoPlaces[0]!, 90))).toBe(true);
    // Первое приглашение было 2 часа назад: при кулдауне 1 ч второе проходит, при 24 ч по умолчанию — нет
    await ds.query(`UPDATE interests SET updated_at = now() - interval '2 hours' WHERE student_user_id = $1 AND status = 'invited'`, [s2]);
    const second = await interest(s2, demoPlaces[1]!, 90);
    expect(await inviteForDemoEmployer(ds, second)).toBe(false);
    expect(await inviteForDemoEmployer(ds, second, { cooldownHours: 3 })).toBe(false);
    expect(await inviteForDemoEmployer(ds, second, { cooldownHours: 1 })).toBe(true);
  });

  it('догоняющий проход тоже берёт кулдаун из параметра', async () => {
    const s = await newStudent();
    expect(await inviteForDemoEmployer(ds, await interest(s, demoPlaces[0]!, 90))).toBe(true);
    const pending = await interest(s, demoPlaces[2]!, 90, 'interested', `now() - interval '1 minute'`);
    expect((await inviteRecentForDemoEmployers(ds)).map((e) => e.interestId)).not.toContain(pending);
    expect((await inviteRecentForDemoEmployers(ds, { cooldownHours: 0 })).map((e) => e.interestId)).toContain(pending);
    expect(await statusOf(pending)).toBe('invited');
  });

  it('ниже 70 %, пропуск, закрытое, не демо-место или демо-студент — не приглашает', async () => {
    const s = await newStudent();
    expect(await inviteForDemoEmployer(ds, await interest(s, demoPlaces[0]!, 65))).toBe(false);
    expect(await inviteForDemoEmployer(ds, await interest(s, demoPlaces[1]!, 90, 'skipped'))).toBe(false);

    await ds.query(`UPDATE internships SET status = 'closed' WHERE id = $1`, [demoPlaces[5]]);
    expect(await inviteForDemoEmployer(ds, await interest(s, demoPlaces[5]!, 90))).toBe(false);

    const [real] = await ds.query(
      `INSERT INTO internships (employer_id, title, required_skills, nice_skills, format) VALUES ($1, 'Аналитик', '{excel}', '{}', 'remote') RETURNING id`,
      [realEmployer],
    );
    const realInterest = await interest(s, Number(real.id), 100);
    expect(await inviteForDemoEmployer(ds, realInterest)).toBe(false);
    expect(await statusOf(realInterest)).toBe('interested');

    const [demoStudentInterest] = await ds.query(
      `SELECT x.id FROM interests x JOIN internships s ON s.id = x.internship_id
       WHERE x.is_demo AND s.is_demo AND s.status = 'open' AND x.status = 'interested' AND x.match_score >= 70 LIMIT 1`,
    );
    expect(await inviteForDemoEmployer(ds, Number(demoStudentInterest.id))).toBe(false);
  });

  it('после рестарта — приглашает отклики последних 10 минут, старые и чужие не трогает', async () => {
    const fresh = await interest(await newStudent(), demoPlaces[2]!, 80, 'interested', `now() - interval '3 minutes'`);
    const old = await interest(await newStudent(), demoPlaces[2]!, 80, 'interested', `now() - interval '2 hours'`);
    const invited = await inviteRecentForDemoEmployers(ds);
    expect(invited.map((e) => e.interestId)).toEqual([fresh]);
    expect(invited[0]!.internshipId).toBe(demoPlaces[2]);
    expect(await statusOf(old)).toBe('interested');
  });

  it('подписки: отклик → через паузу interest.invited; передумал за паузу — ничего; место проверяющего → demo.responses', async () => {
    const events = new EventBus(pino({ level: 'silent' }));
    const invited: AppEvents['interest.invited'][] = [];
    const responses: AppEvents['demo.responses'][] = [];
    events.on('interest.invited', (e) => void invited.push(e));
    events.on('demo.responses', (e) => void responses.push(e));
    registerDemoResponder({ events, ds, log: pino({ level: 'silent' }), threshold: 60, inviteDelayMs: 50 });

    const s = await newStudent();
    const id = await interest(s, demoPlaces[3]!, 80);
    events.emit('interest.created', { interestId: id, internshipId: demoPlaces[3]!, studentUserId: s, status: 'interested' });
    await until(() => invited.some((e) => e.interestId === id));
    expect(invited.filter((e) => e.interestId === id)).toEqual([{ interestId: id, internshipId: demoPlaces[3], studentUserId: s }]);

    const s2 = await newStudent();
    const changed = await interest(s2, demoPlaces[4]!, 80);
    events.emit('interest.created', { interestId: changed, internshipId: demoPlaces[4]!, studentUserId: s2, status: 'interested' });
    await ds.query(`UPDATE interests SET status = 'skipped' WHERE id = $1`, [changed]);
    await sleep(200);
    expect(invited.some((e) => e.interestId === changed)).toBe(false);

    const [mine] = await ds.query(
      `INSERT INTO internships (employer_id, title, required_skills, nice_skills, format) VALUES ($1, 'Карточки WB', '{marketplace_cards,wildberries}', '{ozon}', 'remote') RETURNING id`,
      [realEmployer],
    );
    events.emit('internship.created', { internshipId: Number(mine.id) });
    await until(() => responses.length > 0);
    expect(responses).toHaveLength(1);
    expect(responses[0]!.internshipId).toBe(Number(mine.id));
    expect(responses[0]!.count).toBeGreaterThan(0);
  });

  it('подписки: inviteCooldownHours из окружения доходит до приглашения', async () => {
    // Первое приглашение — до подписки: догоняющий проход при старте (тоже без кулдауна) не должен его перехватить
    const s = await newStudent();
    expect(await inviteForDemoEmployer(ds, await interest(s, demoPlaces[0]!, 90))).toBe(true);

    const events = new EventBus(pino({ level: 'silent' }));
    const invited: AppEvents['interest.invited'][] = [];
    events.on('interest.invited', (e) => void invited.push(e));
    registerDemoResponder({ events, ds, log: pino({ level: 'silent' }), threshold: 60, inviteDelayMs: 50, inviteCooldownHours: 0 });

    const second = await interest(s, demoPlaces[1]!, 90);
    events.emit('interest.created', { interestId: second, internshipId: demoPlaces[1]!, studentUserId: s, status: 'interested' });
    await until(() => invited.some((e) => e.interestId === second));
    expect(await statusOf(second)).toBe('invited');
  });
});
