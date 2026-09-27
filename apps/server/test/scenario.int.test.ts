// Сквозной сценарий API на настоящем PostgreSQL. Запуск:
//   TEST_DATABASE_URL=postgres://app:pass@localhost:5432/app_test npm test
// Без TEST_DATABASE_URL тесты пропускаются. БД очищается целиком — не указывайте рабочую базу.
import { pino } from 'pino';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { matcher } from '../src/matching/index.js';
import { CONSENT_VERSION } from '../src/api/routes.js';
import { createApp } from '../src/app.js';
import { signContact } from '../src/auth/contact.js';
import { buildInitData } from '../src/auth/initData.js';
import { loadConfig } from '../src/config.js';
import { createDataSource } from '../src/db/dataSource.js';
import { createRepos } from '../src/db/repos.js';
import { EventBus, type AppEvents } from '../src/events.js';

const url = process.env.TEST_DATABASE_URL;
const TOKEN = 'test-bot-token';

describe.skipIf(!url)('основной сценарий', () => {
  let ds: DataSource;
  let app: ReturnType<typeof createApp>;
  const emitted: { name: keyof AppEvents; payload: unknown }[] = [];

  const auth = (maxId: number) =>
    buildInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: maxId, first_name: `U${maxId}`, last_name: 'Тестов' }) }, TOKEN);
  const as = (maxId: number) => ({
    get: (p: string) => request(app).get(p).set('X-Max-Init-Data', auth(maxId)),
    post: (p: string, body?: object) => request(app).post(p).set('X-Max-Init-Data', auth(maxId)).send(body),
    put: (p: string, body: object) => request(app).put(p).set('X-Max-Init-Data', auth(maxId)).send(body),
    patch: (p: string, body: object) => request(app).patch(p).set('X-Max-Init-Data', auth(maxId)).send(body),
  });
  const tick = () => new Promise((r) => setImmediate(r));
  const count = (name: keyof AppEvents) => emitted.filter((e) => e.name === name).length;

  const EMPLOYER = 200001;
  const STUDENT = 200002;
  const OTHER_EMPLOYER = 200003;
  let internshipId = 0;
  let studentUserId = 0;

  beforeAll(async () => {
    ds = createDataSource(url!);
    await ds.initialize();
    await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await ds.runMigrations();
    await ds.query(`INSERT INTO skills (code, name, group_name) VALUES
      ('excel','Excel','Аналитика'), ('sql','SQL','Аналитика'), ('power_bi','Power BI','Аналитика'), ('figma','Figma','Дизайн')`);

    const log = pino({ level: 'silent' });
    const events = new EventBus(log);
    for (const name of ['internship.created', 'interest.created', 'interest.invited'] as const) {
      events.on(name, (payload) => void emitted.push({ name, payload }));
    }
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, MAX_BOT_TOKEN: TOKEN, RATE_LIMIT_PER_MIN: '10000' });
    app = createApp({ config, log, repos: createRepos(ds), events, domain: { ds, matcher } });
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('без согласия профиль не сохраняется', async () => {
    const res = await as(EMPLOYER).put('/api/employer/profile', { companyName: 'ООО «Вектор»', city: 'Москва', contactName: 'Ольга' });
    expect(res.status).toBe(403);
  });

  it('работодатель заполняет профиль и публикует стажировку', async () => {
    await as(EMPLOYER).post('/api/me/consent', { version: CONSENT_VERSION }).expect(200);
    await as(EMPLOYER).put('/api/employer/profile', { companyName: 'ООО «Вектор»', city: 'Москва', contactName: 'Ольга' }).expect(200);
    expect((await as(EMPLOYER).get('/api/me')).body.roles).toEqual({ student: false, employer: true });

    const res = await as(EMPLOYER).post('/api/internships', {
      title: 'Стажёр-аналитик',
      requiredSkills: ['excel', 'sql'],
      niceSkills: ['power_bi'],
      format: 'office',
      city: 'Москва',
      startsOn: '2026-10-15',
      endsOn: '2026-12-15',
      slots: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Стажёр-аналитик', company: { name: 'ООО «Вектор»' }, status: 'open', isOwner: true });
    internshipId = res.body.id;
    await tick();
    expect(emitted.at(-1)).toEqual({ name: 'internship.created', payload: { internshipId } });
  });

  it('форма стажировки проверяется на сервере', async () => {
    const bad = await as(EMPLOYER).post('/api/internships', {
      title: '',
      requiredSkills: ['excel', 'cobol'],
      niceSkills: ['excel'],
      format: 'office',
      startsOn: '2026-10-15',
      endsOn: '2026-10-01',
    });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields)).toContain('title');

    const rules = await as(EMPLOYER).post('/api/internships', {
      title: 'Без города', requiredSkills: ['excel'], niceSkills: ['excel'], format: 'office', startsOn: '2026-10-15', endsOn: '2026-10-01',
    });
    expect(rules.body.error.fields).toMatchObject({ city: expect.any(String), endsOn: expect.any(String), niceSkills: expect.any(String) });

    const unknown = await as(EMPLOYER).post('/api/internships', { title: 'X', requiredSkills: ['cobol'], format: 'remote' });
    expect(unknown.body.error.fields.requiredSkills).toContain('cobol');
  });

  it('студент: согласие, телефон, анкета', async () => {
    await as(STUDENT).post('/api/me/consent', { version: CONSENT_VERSION }).expect(200);
    const me = await as(STUDENT).get('/api/me');
    studentUserId = me.body.id;

    const contact = { phone: '+79990001122', authDate: '1790500000' };
    const badPhone = await as(STUDENT).post('/api/me/phone', { ...contact, hash: signContact(contact, STUDENT + 1, TOKEN) });
    expect(badPhone.status).toBe(400);
    const phone = await as(STUDENT).post('/api/me/phone', { ...contact, hash: signContact(contact, STUDENT, TOKEN) });
    expect(phone.body.hasPhone).toBe(true);

    const res = await as(STUDENT).put('/api/student/profile', {
      university: 'РАНХиГС', course: 3, direction: 'Бизнес-информатика', city: 'москва', formats: ['office', 'hybrid'], skills: ['excel', 'power_bi'],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ faculty: null, skills: ['excel', 'power_bi'] });
  });

  it('«Мои отклики» без откликов — пустой список', async () => {
    const res = await as(STUDENT).get('/api/student/interests');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('лента: стажировка с процентом и расшифровкой', async () => {
    const res = await as(STUDENT).get('/api/student/feed');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].match).toEqual({ score: 65, mustMatched: ['excel'], mustMissing: ['sql'], niceMatched: ['power_bi'], niceMissing: [] });
  });

  it('отклик идемпотентен', async () => {
    const first = await as(STUDENT).post(`/api/internships/${internshipId}/interest`, { action: 'interested' });
    expect(first.body).toMatchObject({ status: 'interested', match: { score: 65 } });
    await as(STUDENT).post(`/api/internships/${internshipId}/interest`, { action: 'interested' }).expect(200);
    await tick();
    expect(count('interest.created')).toBe(1);
    expect((await as(STUDENT).get('/api/student/feed')).body.items).toHaveLength(0);
  });

  it('работодатель видит кандидата без контактов; чужой работодатель не видит', async () => {
    const res = await as(EMPLOYER).get(`/api/internships/${internshipId}/candidates`);
    expect(res.body.items).toEqual([
      expect.objectContaining({ studentId: studentUserId, status: 'interested', phone: null, lastName: null, university: 'РАНХиГС' }),
    ]);
    const list = await as(EMPLOYER).get('/api/employer/internships');
    expect(list.body.items[0].counts).toEqual({ interested: 1, invited: 0, declined: 0 });

    await as(OTHER_EMPLOYER).post('/api/me/consent', { version: CONSENT_VERSION });
    await as(OTHER_EMPLOYER).put('/api/employer/profile', { companyName: 'Другая', city: 'Москва', contactName: 'Иван' });
    expect((await as(OTHER_EMPLOYER).get(`/api/internships/${internshipId}/candidates`)).status).toBe(404);
    expect((await as(OTHER_EMPLOYER).post(`/api/internships/${internshipId}/candidates/${studentUserId}/invite`)).status).toBe(404);
    expect((await as(OTHER_EMPLOYER).patch(`/api/internships/${internshipId}`, { status: 'closed' })).status).toBe(404);
  });

  it('приглашение раскрывает контакты обоим, повтор идемпотентен', async () => {
    const res = await as(EMPLOYER).post(`/api/internships/${internshipId}/candidates/${studentUserId}/invite`);
    expect(res.body).toMatchObject({ status: 'invited', phone: '+79990001122', lastName: 'Тестов' });
    await as(EMPLOYER).post(`/api/internships/${internshipId}/candidates/${studentUserId}/invite`).expect(200);
    await tick();
    expect(count('interest.invited')).toBe(1);

    expect((await as(EMPLOYER).post(`/api/internships/${internshipId}/candidates/${studentUserId}/decline`)).status).toBe(409);
    expect((await as(STUDENT).post(`/api/internships/${internshipId}/interest`, { action: 'skipped' })).status).toBe(409);

    const mine = await as(STUDENT).get('/api/student/interests');
    expect(mine.body.items[0]).toMatchObject({ status: 'invited', employerContact: { name: 'Ольга', phone: null } });
  });

  it('карточка стажировки: студенту — совпадение и статус', async () => {
    const res = await as(STUDENT).get(`/api/internships/${internshipId}`);
    expect(res.body).toMatchObject({ match: { score: 65 }, myInterest: 'invited', isOwner: false });
    expect((await as(STUDENT).get('/api/internships/999999')).status).toBe(404);
  });

  it('без профиля нужной роли — 403', async () => {
    expect((await as(STUDENT).post('/api/internships', { title: 'X', requiredSkills: ['excel'], format: 'remote' })).status).toBe(403);
    expect((await as(EMPLOYER).get('/api/student/feed')).status).toBe(403);
  });

  it('закрытая стажировка не принимает новые отклики', async () => {
    const created = await as(EMPLOYER).post('/api/internships', { title: 'Удалённо', requiredSkills: ['excel'], format: 'remote' });
    await as(EMPLOYER).patch(`/api/internships/${created.body.id}`, { status: 'closed' }).expect(200);
    const res = await as(STUDENT).post(`/api/internships/${created.body.id}/interest`, { action: 'interested' });
    expect(res.status).toBe(409);
  });

  it('параллельные отклики не создают дублей и лишних событий', async () => {
    const created = await as(EMPLOYER).post('/api/internships', { title: 'Параллельно', requiredSkills: ['excel'], format: 'remote' });
    const before = count('interest.created');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => as(STUDENT).post(`/api/internships/${created.body.id}/interest`, { action: 'interested' })),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    await tick();
    expect(count('interest.created') - before).toBe(1);
    const [{ n }] = await ds.query('SELECT count(*) AS n FROM interests WHERE internship_id = $1', [created.body.id]);
    expect(n).toBe(1);
  });
});
