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
import { loadTaskTags } from '../src/db/taskTags.js';
import { TASK_TAGS } from '../src/seed/index.js';
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
  // Обязательные поля места, которые не важны для конкретной проверки
  const PLACE = { type: 'internship', startsOn: '2026-10-15', endsOn: '2026-12-15', paid: false, slots: 1 };

  beforeAll(async () => {
    ds = createDataSource(url!);
    await ds.initialize();
    await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await ds.runMigrations();
    await ds.query(`INSERT INTO skills (code, name, group_name) VALUES
      ('excel','Excel','Аналитика'), ('sql','SQL','Аналитика'), ('power_bi','Power BI','Аналитика'), ('figma','Figma','Дизайн')`);
    await ds.query(`INSERT INTO task_tags (code, name, sort, skills) VALUES
      ('spreadsheets','Таблицы и аналитика',20,'{excel,power_bi}'), ('website','Сайт',10,'{figma}')`);

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

  it('профили до заполнения — 404', async () => {
    expect((await as(EMPLOYER).get('/api/employer/profile')).status).toBe(404);
    expect((await as(STUDENT).get('/api/student/profile')).status).toBe(404);
  });

  it('до согласия храним только id MAX и имя; фамилию — после согласия', async () => {
    const before = await as(OTHER_EMPLOYER).get('/api/me');
    expect(before.body).toMatchObject({ firstName: `U${OTHER_EMPLOYER}`, lastName: null, consent: null });
    const [row] = await ds.query('SELECT last_name FROM users WHERE max_user_id = $1', [OTHER_EMPLOYER]);
    expect(row.last_name).toBeNull();
    const after = await as(OTHER_EMPLOYER).post('/api/me/consent', { version: CONSENT_VERSION });
    expect(after.body).toMatchObject({ lastName: 'Тестов' });
    const cols = await ds.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'username'`);
    expect(cols).toEqual([]);
  });

  it('без согласия профиль не сохраняется', async () => {
    const res = await as(EMPLOYER).put('/api/employer/profile', { companyName: 'ООО «Вектор»', city: 'Москва', contactName: 'Ольга' });
    expect(res.status).toBe(403);
  });

  it('работодатель заполняет профиль и публикует стажировку', async () => {
    await as(EMPLOYER).post('/api/me/consent', { version: CONSENT_VERSION }).expect(200);
    await as(EMPLOYER).put('/api/employer/profile', { companyName: 'ООО «Вектор»', city: 'Москва', contactName: 'Ольга' }).expect(200);
    expect((await as(EMPLOYER).get('/api/employer/profile')).body).toEqual({ companyName: 'ООО «Вектор»', city: 'Москва', contactName: 'Ольга', isDemo: false });
    expect((await as(EMPLOYER).get('/api/me')).body.roles).toEqual({ student: false, employer: true });

    const res = await as(EMPLOYER).post('/api/internships', {
      type: 'practice',
      title: 'Стажёр-аналитик',
      requiredSkills: ['excel', 'sql'],
      niceSkills: ['power_bi'],
      tags: ['spreadsheets'],
      format: 'office',
      city: 'Москва',
      startsOn: '2026-10-15',
      endsOn: '2026-12-15',
      paid: true,
      salary: 30000,
      slots: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      type: 'practice', title: 'Стажёр-аналитик', tags: ['spreadsheets'], paid: true, salary: 30000,
      company: { name: 'ООО «Вектор»' }, status: 'open', isOwner: true,
    });
    internshipId = res.body.id;
    // id — число и в ответе, и в событии для бота (как во всех остальных эндпоинтах)
    expect(typeof internshipId).toBe('number');
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
      ...PLACE, title: 'Без города', requiredSkills: ['excel'], niceSkills: ['excel'], format: 'office', startsOn: '2026-10-15', endsOn: '2026-10-01',
    });
    expect(rules.body.error.fields).toMatchObject({ city: expect.any(String), endsOn: expect.any(String), niceSkills: expect.any(String) });

    const unknown = await as(EMPLOYER).post('/api/internships', { ...PLACE, title: 'X', requiredSkills: ['cobol'], format: 'remote' });
    expect(unknown.body.error.fields.requiredSkills).toContain('cobol');

    // Обязательные поля публикации по решению Артёма
    const missing = await as(EMPLOYER).post('/api/internships', { title: 'X', requiredSkills: ['excel'], format: 'remote' });
    expect(missing.status).toBe(400);
    expect(Object.keys(missing.body.error.fields).sort()).toEqual(['endsOn', 'paid', 'slots', 'startsOn', 'type']);

    const salaryUnpaid = await as(EMPLOYER).post('/api/internships', { ...PLACE, title: 'X', requiredSkills: ['excel'], format: 'remote', salary: 1000 });
    expect(salaryUnpaid.body.error.fields).toEqual({ salary: expect.any(String) });

    const badTags = await as(EMPLOYER).post('/api/internships', {
      ...PLACE, title: 'X', requiredSkills: ['excel'], format: 'remote', tags: ['website', 'nope'],
    });
    expect(badTags.body.error.fields.tags).toContain('nope');
    const tooMany = await as(EMPLOYER).post('/api/internships', {
      ...PLACE, title: 'X', requiredSkills: ['excel'], format: 'remote', tags: ['a', 'b', 'c', 'd'],
    });
    expect(tooMany.body.error.fields.tags).toBeDefined();
    const badType = await as(EMPLOYER).post('/api/internships', { ...PLACE, type: 'job', title: 'X', requiredSkills: ['excel'], format: 'remote' });
    expect(badType.body.error.fields.type).toBeDefined();
  });

  it('студент: согласие, телефон, анкета', async () => {
    await as(STUDENT).post('/api/me/consent', { version: CONSENT_VERSION }).expect(200);
    const me = await as(STUDENT).get('/api/me');
    studentUserId = me.body.id;

    const contact = { phone: '+79990001122', authDate: String(Math.floor(Date.now() / 1000)) };
    // Подпись номера старше срока данных запуска не принимается
    const stale = { phone: '+79990001122', authDate: '1690000000' };
    const stalePhone = await as(STUDENT).post('/api/me/phone', { ...stale, hash: signContact(stale, STUDENT, TOKEN) });
    expect(stalePhone.status).toBe(400);
    expect(stalePhone.body.error.fields.phone).toContain('устарела');
    const badPhone = await as(STUDENT).post('/api/me/phone', { ...contact, hash: signContact(contact, STUDENT + 1, TOKEN) });
    expect(badPhone.status).toBe(400);
    const phone = await as(STUDENT).post('/api/me/phone', { ...contact, hash: signContact(contact, STUDENT, TOKEN) });
    expect(phone.body.hasPhone).toBe(true);

    const profile = { university: 'РАНХиГС', course: 3, direction: 'Бизнес-информатика', city: 'москва', formats: ['office', 'hybrid'] };
    // Меньше 3 навыков — анкета не сохраняется
    const few = await as(STUDENT).put('/api/student/profile', { ...profile, skills: ['excel', 'power_bi', 'excel'] });
    expect(few.status).toBe(400);
    expect(few.body.error.fields.skills).toBeDefined();
    const badMonth = await as(STUDENT).put('/api/student/profile', { ...profile, skills: ['excel', 'power_bi', 'figma'], practiceMonth: '2026-13' });
    expect(badMonth.body.error.fields.practiceMonth).toBeDefined();

    const res = await as(STUDENT).put('/api/student/profile', { ...profile, skills: ['excel', 'power_bi', 'figma'], practiceMonth: '2026-11' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ faculty: null, skills: ['excel', 'power_bi', 'figma'], practiceMonth: '2026-11' });
    expect((await as(STUDENT).get('/api/student/profile')).body).toMatchObject({ university: 'РАНХиГС', practiceMonth: '2026-11' });
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
    const foreign = await as(OTHER_EMPLOYER).patch(`/api/internships/${internshipId}`, { status: 'closed' });
    expect(foreign.status).toBe(404);
    // В интерфейсе сущность — «место»: тексты ошибок идут в тосты как есть
    expect(foreign.body.error.message).toBe('Место не найдено');
  });

  it('время отклика — первое «Интересно»: переключение «пропустить → интересно» его не сдвигает', async () => {
    const candidates = () => as(EMPLOYER).get(`/api/internships/${internshipId}/candidates`);
    const first = (await candidates()).body.items[0].interestedAt as string;
    const [row] = await ds.query('SELECT interested_at FROM interests WHERE internship_id = $1', [internshipId]);
    expect(first).toBe(new Date(row.interested_at).toISOString());

    await as(STUDENT).post(`/api/internships/${internshipId}/interest`, { action: 'skipped' }).expect(200);
    expect((await candidates()).body.items).toEqual([]);
    await new Promise((r) => setTimeout(r, 20));
    await as(STUDENT).post(`/api/internships/${internshipId}/interest`, { action: 'interested' }).expect(200);
    expect((await candidates()).body.items[0]).toMatchObject({ status: 'interested', interestedAt: first });
  });

  it('приглашение раскрывает контакты обоим, повтор идемпотентен', async () => {
    const res = await as(EMPLOYER).post(`/api/internships/${internshipId}/candidates/${studentUserId}/invite`);
    expect(res.body).toMatchObject({ status: 'invited', phone: '+79990001122', lastName: 'Тестов' });
    await as(EMPLOYER).post(`/api/internships/${internshipId}/candidates/${studentUserId}/invite`).expect(200);
    await tick();
    expect(count('interest.invited')).toBe(1);

    expect((await as(EMPLOYER).post(`/api/internships/${internshipId}/candidates/${studentUserId}/decline`)).status).toBe(409);
    const late = await as(STUDENT).post(`/api/internships/${internshipId}/interest`, { action: 'skipped' });
    expect(late.status).toBe(409);
    expect(late.body.error.message).toBe('Работодатель уже пригласил вас на это место');

    const mine = await as(STUDENT).get('/api/student/interests');
    expect(mine.body.items[0]).toMatchObject({ status: 'invited', employerContact: { name: 'Ольга', phone: null } });
  });

  it('карточка стажировки: студенту — совпадение и статус', async () => {
    const res = await as(STUDENT).get(`/api/internships/${internshipId}`);
    expect(res.body).toMatchObject({ match: { score: 65 }, myInterest: 'invited', isOwner: false });
    const missing = await as(STUDENT).get('/api/internships/999999');
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe('Место не найдено');
  });

  // #75: номера мест идут подряд и видны в ссылке QR — перебор не должен давать ничего сверх публичной карточки
  it('по номеру места: без подписи — 401, карточка — только публичные поля, контакт — только приглашённому', async () => {
    for (const path of [`/api/internships/${internshipId}`, `/api/internships/${internshipId}/candidates`]) {
      expect((await request(app).get(path)).status, path).toBe(401);
    }
    expect((await request(app).post(`/api/internships/${internshipId}/candidates/${studentUserId}/invite`)).status).toBe(401);

    const PUBLIC = [
      'id', 'type', 'title', 'description', 'company', 'requiredSkills', 'niceSkills', 'tags', 'format', 'city',
      'startsOn', 'endsOn', 'paid', 'salary', 'slots', 'status', 'source', 'sourceUrl', 'isDemo', 'createdAt',
      'match', 'myInterest', 'isOwner',
    ];
    // Посторонний (не студент и не владелец) и студент — никаких телефонов, имён контактов и внутренних id
    for (const who of [OTHER_EMPLOYER, STUDENT]) {
      const card = (await as(who).get(`/api/internships/${internshipId}`)).body as Record<string, unknown>;
      for (const key of Object.keys(card)) expect(PUBLIC, `${who}: ${key}`).toContain(key);
      expect(Object.keys(card.company as object).sort()).toEqual(['city', 'name']);
      expect(JSON.stringify(card)).not.toMatch(/\+7\d{10}|phone|ownerUserId|employerId|contactName/);
    }
  });

  it('без профиля нужной роли — 403', async () => {
    expect((await as(STUDENT).post('/api/internships', { ...PLACE, title: 'X', requiredSkills: ['excel'], format: 'remote' })).status).toBe(403);
    expect((await as(EMPLOYER).get('/api/student/feed')).status).toBe(403);
  });

  it('закрытая стажировка не принимает новые отклики', async () => {
    const created = await as(EMPLOYER).post('/api/internships', { ...PLACE, title: 'Удалённо', requiredSkills: ['excel'], format: 'remote' });
    await as(EMPLOYER).patch(`/api/internships/${created.body.id}`, { status: 'closed' }).expect(200);
    const res = await as(STUDENT).post(`/api/internships/${created.body.id}/interest`, { action: 'interested' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Набор на это место закрыт');
    expect(res.body.error.message).not.toMatch(/стажировк/i);
  });

  it('параллельные отклики не создают дублей и лишних событий', async () => {
    const created = await as(EMPLOYER).post('/api/internships', { ...PLACE, title: 'Параллельно', requiredSkills: ['excel'], format: 'remote' });
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

  it('справочник тегов и группы навыков — в заданном порядке', async () => {
    const tags = await as(STUDENT).get('/api/tags');
    expect(tags.body.items).toEqual([
      { code: 'website', name: 'Сайт', skills: ['figma'] },
      { code: 'spreadsheets', name: 'Таблицы и аналитика', skills: ['excel', 'power_bi'] },
    ]);
    // Сквозной sort: группы идут в заданном порядке, а не по алфавиту
    await ds.query(`UPDATE skills SET sort = CASE group_name WHEN 'Дизайн' THEN 100 ELSE 200 END`);
    const skills = await as(STUDENT).get('/api/skills');
    expect(skills.body.groups.map((g: { name: string }) => g.name)).toEqual(['Дизайн', 'Аналитика']);
    // sort внутри группы (одинаковые значения у разных групп) — группы по алфавиту, как раньше
    await ds.query(`UPDATE skills SET sort = 10`);
    const same = await as(STUDENT).get('/api/skills');
    expect(same.body.groups.map((g: { name: string }) => g.name)).toEqual(['Аналитика', 'Дизайн']);
  });

  it('лента фильтруется по тегам', async () => {
    const tagged = await as(EMPLOYER).post('/api/internships', {
      ...PLACE, title: 'С тегом «Сайт»', requiredSkills: ['figma'], format: 'office', city: 'Москва', tags: ['website'],
    });
    expect(tagged.status).toBe(201);
    const all = await as(STUDENT).get('/api/student/feed');
    const onlySite = await as(STUDENT).get('/api/student/feed?tags=website');
    const unknownTag = await as(STUDENT).get('/api/student/feed?tags=nope');
    const asArray = await as(STUDENT).get('/api/student/feed?tags=nope&tags=website');
    expect(all.body.items.map((i: { id: number }) => i.id)).toContain(tagged.body.id);
    expect(onlySite.body.items.map((i: { id: number }) => i.id)).toEqual([tagged.body.id]);
    expect(unknownTag.body.items).toEqual([]);
    expect(asArray.status).toBe(200);
    expect(asArray.body.items.map((i: { id: number }) => i.id)).toEqual([tagged.body.id]);
  });

  it('оплата: сумма только у оплачиваемого места, при снятии оплаты сумма сбрасывается', async () => {
    const created = await as(EMPLOYER).post('/api/internships', {
      ...PLACE, type: 'part_time', title: 'Подработка', requiredSkills: ['excel'], format: 'remote', paid: true, salary: 25000,
    });
    expect(created.body).toMatchObject({ type: 'part_time', paid: true, salary: 25000 });
    const unpaid = await as(EMPLOYER).patch(`/api/internships/${created.body.id}`, { paid: false });
    expect(unpaid.status).toBe(200);
    expect(unpaid.body).toMatchObject({ paid: false, salary: null });
    const bad = await as(EMPLOYER).patch(`/api/internships/${created.body.id}`, { salary: 1000 });
    expect(bad.body.error.fields).toEqual({ salary: expect.any(String) });
    const retag = await as(EMPLOYER).patch(`/api/internships/${created.body.id}`, { type: 'practice', tags: ['spreadsheets'] });
    expect(retag.body).toMatchObject({ type: 'practice', tags: ['spreadsheets'] });

    // Форма переотправляет состояние целиком: paid:false со старой суммой — сумма сбрасывается, а не 400
    await as(EMPLOYER).patch(`/api/internships/${created.body.id}`, { paid: true, salary: 25000 }).expect(200);
    const resent = await as(EMPLOYER).patch(`/api/internships/${created.body.id}`, { paid: false, salary: 25000 });
    expect(resent.status).toBe(200);
    expect(resent.body).toMatchObject({ paid: false, salary: null });

    // Ошибка по датам — в том поле, которое меняли
    const late = await as(EMPLOYER).patch(`/api/internships/${created.body.id}`, { startsOn: '2027-01-01' });
    expect(late.body.error.fields).toEqual({ startsOn: expect.any(String) });
  });

  it('необязательные поля: null и дубли тегов', async () => {
    const res = await as(EMPLOYER).post('/api/internships', {
      ...PLACE, title: 'С null', requiredSkills: ['excel'], format: 'remote',
      description: null, niceSkills: null, salary: null, tags: ['website', 'website', 'website', 'website'],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ description: '', niceSkills: [], salary: null, tags: ['website'] });

    const profile = { university: 'РАНХиГС', course: 3, direction: 'БИ', city: 'Москва', formats: ['remote'], skills: ['excel', 'sql', 'figma'] };
    const empty = await as(STUDENT).put('/api/student/profile', { ...profile, practiceMonth: '' });
    expect(empty.body.practiceMonth).toBeNull();
    const wrongType = await as(STUDENT).put('/api/student/profile', { ...profile, practiceMonth: 202611 });
    expect(wrongType.body.error.fields.practiceMonth).toBe('Месяц в формате ГГГГ-ММ');
  });

  it('места, созданные в обход API (демо, импорт), получают тип «стажировка» и оплату «не указано»', async () => {
    const [row] = await ds.query(
      `INSERT INTO internships (company_name, title, required_skills, format, source, source_id)
       VALUES ('Импорт', 'Из импорта', '{excel}', 'remote', 'trudvsem', 'x-1') RETURNING type, paid, salary, tags`,
    );
    expect(row).toEqual({ type: 'internship', paid: null, salary: null, tags: [] });
  });

  it('справочник тегов из сида грузится в порядке TASK_TAGS, повторная загрузка без дублей', async () => {
    expect(await loadTaskTags(ds, TASK_TAGS)).toBe(TASK_TAGS.length);
    await loadTaskTags(ds, TASK_TAGS);
    const res = await as(STUDENT).get('/api/tags');
    const fromSeed = TASK_TAGS.map((t) => ({ code: t.code, name: t.name, skills: t.skills }));
    // Теги из сида идут первыми и в своём порядке; тестовые из beforeAll с кодами вне сида — после
    expect(res.body.items.slice(0, TASK_TAGS.length)).toEqual(fromSeed);
    const [{ n }] = await ds.query('SELECT count(*) AS n FROM task_tags WHERE code = ANY($1)', [TASK_TAGS.map((t) => t.code)]);
    expect(n).toBe(TASK_TAGS.length);
  });

  it('мусор во входных данных — 400, а не 500', async () => {
    const nul = await as(EMPLOYER).post('/api/internships', { ...PLACE, title: 'С нулём\u0000', requiredSkills: ['excel'], format: 'remote' });
    expect(nul.status).toBe(400);
    expect(nul.body.error.fields.title).toBe('Недопустимый символ');
    const nulSkill = await as(EMPLOYER).post('/api/internships', { ...PLACE, title: 'X', requiredSkills: ['ex\u0000cel'], format: 'remote' });
    expect(nulSkill.status).toBe(400);
    const year0 = await as(EMPLOYER).post('/api/internships', { ...PLACE, startsOn: '0000-01-01', title: 'X', requiredSkills: ['excel'], format: 'remote' });
    expect(year0.status).toBe(400);
    expect(year0.body.error.fields.startsOn).toBeDefined();
    const longCode = await as(EMPLOYER).post('/api/internships', { ...PLACE, title: 'X', requiredSkills: ['x'.repeat(65)], format: 'remote' });
    expect(longCode.status).toBe(400);
    const badDate = await as(EMPLOYER).post('/api/me/phone', { phone: '+79990000000', authDate: 'abc', hash: 'a'.repeat(64) });
    expect(badDate.status).toBe(400);
    // Битое кодирование в параметре адреса — 400, а не 500
    expect((await as(EMPLOYER).get('/api/internships/%E0%A4%A')).status).toBe(400);
    expect((await as(EMPLOYER).post('/api/internships/1/candidates/%FF/invite')).status).toBe(400);
  });

  it('не больше 20 открытых мест у работодателя', async () => {
    const OWNER = 200099;
    await as(OWNER).post('/api/me/consent', { version: CONSENT_VERSION });
    await as(OWNER).put('/api/employer/profile', { companyName: 'Спам', city: 'Москва', contactName: 'С' }).expect(200);
    const ids: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await as(OWNER).post('/api/internships', { ...PLACE, title: `Место ${i}`, requiredSkills: ['excel'], format: 'remote' });
      expect(r.status).toBe(201);
      ids.push(r.body.id);
    }
    const over = await as(OWNER).post('/api/internships', { ...PLACE, title: 'Лишнее', requiredSkills: ['excel'], format: 'remote' });
    expect(over.status).toBe(409);
    await as(OWNER).patch(`/api/internships/${ids[0]}`, { status: 'closed' }).expect(200);
    await as(OWNER).post('/api/internships', { ...PLACE, title: 'После закрытия', requiredSkills: ['excel'], format: 'remote' }).expect(201);
    // Переоткрыть закрытое сверх лимита тоже нельзя
    expect((await as(OWNER).patch(`/api/internships/${ids[0]}`, { status: 'open' })).status).toBe(409);
  });

  it('лента отбрасывает места без общих навыков и в чужом формате ещё в SQL', async () => {
    const profile = { university: 'РАНХиГС', course: 3, direction: 'БИ', city: 'Москва', formats: ['remote'], skills: ['excel', 'sql', 'power_bi'] };
    await as(STUDENT).put('/api/student/profile', profile).expect(200);
    const E3 = 200077;
    await as(E3).post('/api/me/consent', { version: CONSENT_VERSION });
    await as(E3).put('/api/employer/profile', { companyName: 'Фильтр', city: 'Москва', contactName: 'Ф' }).expect(200);
    const match = await as(E3).post('/api/internships', { ...PLACE, title: 'Подходит', requiredSkills: ['sql'], format: 'remote' });
    const noSkill = await as(E3).post('/api/internships', { ...PLACE, title: 'Нет навыков', requiredSkills: ['figma'], format: 'remote' });
    const office = await as(E3).post('/api/internships', { ...PLACE, title: 'Очно', requiredSkills: ['sql'], format: 'office', city: 'Москва' });
    const feed = (await as(STUDENT).get('/api/student/feed')).body.items.map((i: { id: number }) => i.id);
    expect(feed).toContain(match.body.id);
    expect(feed).not.toContain(noSkill.body.id);
    expect(feed).not.toContain(office.body.id);
  });

  it('лента: места с совпадением ниже FEED_MIN_SCORE (40 %) не показываются, по прямой ссылке открываются', async () => {
    // Профиль из прошлого теста: excel, sql, power_bi, удалённо
    const E4 = 200078;
    await as(E4).post('/api/me/consent', { version: CONSENT_VERSION });
    await as(E4).put('/api/employer/profile', { companyName: 'Порог', city: 'Москва', contactName: 'П' }).expect(200);
    // Обязательный не закрыт, желательный закрыт: 70 × 0/1 + 30 × 1/1 = 30 % — ниже порога; 70 × 1/2 + 30 × 1/1 = 65 % — выше
    const low = await as(E4).post('/api/internships', { ...PLACE, title: 'Слабое', requiredSkills: ['figma'], niceSkills: ['sql'], format: 'remote' });
    const fair = await as(E4).post('/api/internships', { ...PLACE, title: 'Среднее', requiredSkills: ['sql', 'figma'], niceSkills: ['excel'], format: 'remote' });
    const feed = (await as(STUDENT).get('/api/student/feed')).body.items as { id: number; match: { score: number } }[];
    expect(feed.map((i) => i.id)).not.toContain(low.body.id);
    expect(feed.map((i) => i.id)).toContain(fair.body.id);
    for (const i of feed) expect(i.match.score).toBeGreaterThanOrEqual(40);
    // Прямая ссылка и QR — GET /internships/:id: место открывается с процентом, порог ленты его не касается
    const direct = await as(STUDENT).get(`/api/internships/${low.body.id}`).expect(200);
    expect(direct.body.match.score).toBe(30);
    // И откликнуться на него можно
    await as(STUDENT).post(`/api/internships/${low.body.id}/interest`, { action: 'interested' }).expect(200);
  });
});
