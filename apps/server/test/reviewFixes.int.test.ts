// Исправления по ревью сервера (#102) на настоящем PostgreSQL: лимит приглашений по числу мест, места с прошедшим
// сроком в ленте, пересчёт процента у ждущих кандидатов после смены навыков. Запускается, если задан TEST_DATABASE_URL
// (как остальные *.int.test.ts). Собственная схема review_fixes_test.
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { CONSENT_VERSION } from '../src/api/routes.js';
import { buildInitData } from '../src/auth/initData.js';
import { loadConfig } from '../src/config.js';
import { createDataSource } from '../src/db/dataSource.js';
import { createRepos } from '../src/db/repos.js';
import { EventBus } from '../src/events.js';
import { createLogger } from '../src/logger.js';
import { matcher } from '../src/matching/index.js';
import { seedSkills } from '../src/seed/index.js';

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = 'review_fixes_test';

function withSearchPath(base: string): string {
  const u = new URL(base);
  u.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return u.toString();
}

const day = (offset: number) => new Date(Date.now() + offset * 24 * 3600_000).toISOString().slice(0, 10);

describe.skipIf(!url)('исправления по ревью сервера (#102)', () => {
  let ds: DataSource;
  let app: ReturnType<typeof createApp>;
  // Токен — случайный на каждый запуск: подпись initData проверяется по-настоящему
  const botToken = randomBytes(24).toString('hex');

  const auth = (maxId: number) =>
    buildInitData(
      { user: JSON.stringify({ id: maxId, first_name: `U${maxId}`, last_name: 'Тестов' }), auth_date: String(Math.floor(Date.now() / 1000)) },
      botToken,
    );
  const as = (maxId: number) => ({
    get: (p: string) => request(app).get(p).set('X-Max-Init-Data', auth(maxId)),
    post: (p: string, body?: object) => request(app).post(p).set('X-Max-Init-Data', auth(maxId)).send(body),
    put: (p: string, body: object) => request(app).put(p).set('X-Max-Init-Data', auth(maxId)).send(body),
    patch: (p: string, body: object) => request(app).patch(p).set('X-Max-Init-Data', auth(maxId)).send(body),
  });

  const EMPLOYER = 310001;
  const STUDENTS = [310011, 310012, 310013];
  const PLACE = { type: 'internship', title: 'Аналитик', format: 'remote', paid: false, startsOn: day(-30), endsOn: day(60) };
  const studentIds = new Map<number, number>();

  beforeAll(async () => {
    const admin = createDataSource(url!);
    await admin.initialize();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`);
    await admin.destroy();

    const dbUrl = withSearchPath(url!);
    ds = createDataSource(dbUrl);
    await ds.initialize();
    await ds.runMigrations();
    await seedSkills(ds);

    const config = loadConfig({ DATABASE_URL: dbUrl, MAX_BOT_TOKEN: botToken, LOG_LEVEL: 'silent', RATE_LIMIT_PER_MIN: '1000' });
    const log = createLogger('silent');
    app = createApp({ config, log, repos: createRepos(ds), events: new EventBus(log), domain: { ds, matcher } });

    await as(EMPLOYER).post('/api/me/consent', { version: CONSENT_VERSION }).expect(200);
    await as(EMPLOYER).put('/api/employer/profile', { companyName: 'Вектор', city: 'Москва', contactName: 'Ольга' }).expect(200);
    for (const s of STUDENTS) {
      await as(s).post('/api/me/consent', { version: CONSENT_VERSION }).expect(200);
      await as(s)
        .put('/api/student/profile', { university: 'КФУ', direction: 'БИ', city: 'Казань', course: 3, formats: ['remote'], skills: ['excel', 'power_bi', 'figma'] })
        .expect(200);
      const [row] = await ds.query('SELECT id FROM users WHERE max_user_id = $1', [s]);
      studentIds.set(s, Number(row.id));
    }
  });

  afterAll(async () => {
    await ds?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await ds?.destroy();
  });

  it('пригласить больше студентов, чем мест, нельзя; тестовый студент места не занимает', async () => {
    const place = await as(EMPLOYER).post('/api/internships', { ...PLACE, requiredSkills: ['excel'], slots: 1 }).expect(201);
    const id = place.body.id as number;
    for (const s of STUDENTS) await as(s).post(`/api/internships/${id}/interest`, { action: 'interested' }).expect(200);
    const invite = (s: number) => as(EMPLOYER).post(`/api/internships/${id}/candidates/${studentIds.get(s)}/invite`);

    // Первый — «тестовый»: его приглашение лимит не тратит
    await ds.query('UPDATE interests SET is_demo = true WHERE internship_id = $1 AND student_user_id = $2', [id, studentIds.get(STUDENTS[0]!)]);
    expect((await invite(STUDENTS[0]!)).status).toBe(200);
    expect((await invite(STUDENTS[1]!)).status).toBe(200);
    const over = await invite(STUDENTS[2]!);
    expect(over.status).toBe(409);
    expect(over.body.error.message).toContain('1 из 1');
    // Повтор уже состоявшегося приглашения — по-прежнему не ошибка
    expect((await invite(STUDENTS[1]!)).status).toBe(200);
  });

  it('место с прошедшим сроком не попадает в ленту', async () => {
    const past = await as(EMPLOYER)
      .post('/api/internships', { ...PLACE, title: 'Прошедшее', requiredSkills: ['figma'], startsOn: day(-60), endsOn: day(-1), slots: 1 })
      .expect(201);
    const current = await as(EMPLOYER)
      .post('/api/internships', { ...PLACE, title: 'Текущее', requiredSkills: ['figma'], startsOn: day(-60), endsOn: day(0), slots: 1 })
      .expect(201);
    const feed = (await as(STUDENTS[2]!).get('/api/student/feed').expect(200)).body.items.map((i: { id: number }) => i.id);
    expect(feed).not.toContain(past.body.id);
    expect(feed).toContain(current.body.id);
  });

  it('после смены навыков места процент ждущего кандидата пересчитывается', async () => {
    const place = await as(EMPLOYER).post('/api/internships', { ...PLACE, title: 'Пересчёт', requiredSkills: ['excel', 'sql'], slots: 2 }).expect(201);
    const id = place.body.id as number;
    await as(STUDENTS[0]!).post(`/api/internships/${id}/interest`, { action: 'interested' }).expect(200);
    const score = async () => (await as(EMPLOYER).get(`/api/internships/${id}/candidates`).expect(200)).body.items[0].match.score as number;
    expect(await score()).toBe(50);

    await as(EMPLOYER).patch(`/api/internships/${id}`, { requiredSkills: ['excel'] }).expect(200);
    expect(await score()).toBe(100);
    const [row] = await ds.query('SELECT match_score FROM interests WHERE internship_id = $1', [id]);
    expect(row.match_score).toBe(100);
  });
});
