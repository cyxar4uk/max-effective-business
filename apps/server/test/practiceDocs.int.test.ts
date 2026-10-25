// Документы для практики (F-16, #142): доступ только сторонам приглашения, 409 без реквизитов, подписанные ссылки,
// подстановка в договор и письмо, реквизиты в профиле компании. Нужен PostgreSQL: TEST_DATABASE_URL, своя схема.
import express from 'express';
import JSZip from 'jszip';
import pino from 'pino';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorHandler } from '../src/api/errors.js';
import { createPracticeDocs, LINK_TTL_SEC } from '../src/api/practiceDocs.js';
import { profilesRouter } from '../src/api/profiles.js';
import { createDataSource } from '../src/db/dataSource.js';
import { buildDoc, vuzFor } from '../src/docs/templates.js';
import type { User } from '../src/db/entities.js';
import { EventBus } from '../src/events.js';
import { seedSkills } from '../src/seed/index.js';

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = 'practice_docs_test';
const ORIGIN = 'https://tandem.example.ru';

function withSearchPath(base: string): string {
  const u = new URL(base);
  u.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return u.toString();
}

const REQUISITES = {
  legalName: 'Общество с ограниченной ответственностью «Чайная лавка»',
  inn: '1655123456',
  ogrn: '1021602843470',
  legalAddress: '420111, г. Казань, ул. Баумана, д. 1',
  signerName: 'Сафина Анна Сергеевна',
  signerPosition: 'генеральный директор',
  signerBasis: 'Устава',
  responsibleName: 'Петров Илья Андреевич',
  responsiblePosition: 'руководитель отдела продаж',
  responsiblePhone: '+7 917 000-00-00',
  responsibleEmail: 'practice@example.com',
};

/** Текст document.xml из .docx — чтобы проверить подстановку. */
async function docText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml.replace(/<[^>]+>/g, '');
}

describe.skipIf(!url)('документы для практики', () => {
  let ds: DataSource;
  let app: express.Express;
  let now = new Date('2026-10-25T12:00:00Z');
  const lines: string[] = [];
  let docs: ReturnType<typeof createPracticeDocs>;
  let ownerId: number;
  let studentId: number;
  let strangerId: number;
  let practiceInterest: number;
  let notInvited: number;
  let internshipInterest: number;

  const user = async (maxId: number, first: string, last: string) =>
    Number((await ds.query(`INSERT INTO users (max_user_id, first_name, last_name, consent_at, consent_version) VALUES ($1, $2, $3, now(), 'test') RETURNING id`, [maxId, first, last]))[0].id);
  const place = async (employerId: number, type: string, format = 'office') =>
    Number(
      (
        await ds.query(
          `INSERT INTO internships (employer_id, title, type, format, city, starts_on, ends_on, required_skills, paid)
           VALUES ($1, 'Оформить карточки чая на Wildberries', $2, $3, 'Казань', '2026-11-09', '2026-12-18', '{smm}', true) RETURNING id`,
          [employerId, type, format],
        )
      )[0].id,
    );
  const interest = async (student: number, internship: number, status: string) =>
    Number((await ds.query(`INSERT INTO interests (student_user_id, internship_id, status, match_score, match) VALUES ($1, $2, $3, 90, '{}'::jsonb) RETURNING id`, [student, internship, status]))[0].id);
  const as = (userId: number) => ({ 'x-test-user': String(userId) });

  beforeAll(async () => {
    const admin = createDataSource(url!);
    await admin.initialize();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`);
    await admin.destroy();
    ds = createDataSource(withSearchPath(url!));
    await ds.initialize();
    await ds.runMigrations();
    await seedSkills(ds);

    ownerId = await user(9001, 'Анна', 'Сафина');
    studentId = await user(9002, 'Мария', 'Иванова');
    strangerId = await user(9003, 'Чужой', 'Человек');
    await ds.query(
      `INSERT INTO student_profiles (user_id, university, course, direction, city, formats) VALUES ($1, 'РАНХиГС', 3, 'Маркетинг', 'Казань', '{office}')`,
      [studentId],
    );
    const employerId = Number(
      (await ds.query(`INSERT INTO employers (owner_user_id, company_name, city, contact_name) VALUES ($1, 'Чайная лавка «Сафина»', 'Казань', 'Анна') RETURNING id`, [ownerId]))[0].id,
    );
    practiceInterest = await interest(studentId, await place(employerId, 'practice'), 'invited');
    notInvited = await interest(studentId, await place(employerId, 'practice'), 'interested');
    internshipInterest = await interest(studentId, await place(employerId, 'internship'), 'invited');

    const log = pino({ level: 'info' }, { write: (l: string) => void lines.push(l) });
    docs = createPracticeDocs({ ds, linkSecret: 'test-secret', publicOrigin: ORIGIN, now: () => now });
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { log: typeof log }).log = log;
      next();
    });
    app.use('/api', docs.files);
    // Вместо проверки initData — пользователь из заголовка
    app.use('/api', (req, _res, next) => {
      const id = Number(req.header('x-test-user'));
      (req as unknown as { user: Partial<User> }).user = { id, consentAt: new Date() };
      next();
    });
    app.use('/api', profilesRouter({ ds, matcher: {} as never, events: new EventBus(log) }), docs.authed);
    app.use(errorHandler);
  });

  afterAll(async () => {
    await ds?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await ds?.destroy();
  });

  it('чужой, не приглашён, не практика — 404 и в списке, и в файле', async () => {
    for (const [id, who] of [
      [practiceInterest, strangerId],
      [notInvited, studentId],
      [internshipInterest, studentId],
      [999999, ownerId],
    ] as const) {
      expect((await request(app).get(`/api/interests/${id}/documents`).set(as(who))).status).toBe(404);
      expect((await request(app).get(`/api/interests/${id}/documents/task`).set(as(who))).status).toBe(404);
    }
  });

  it('без реквизитов: requisitesReady false, договор и письмо — 409 без ссылки, задание и отзыв качаются', async () => {
    const list = await request(app).get(`/api/interests/${practiceInterest}/documents`).set(as(studentId));
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ role: 'student', requisitesReady: false, internship: { company: 'Чайная лавка «Сафина»' } });
    const byKind = Object.fromEntries(list.body.items.map((i: { kind: string; url: string | null }) => [i.kind, i.url]));
    expect(byKind.contract).toBeNull();
    expect(byKind.consent_letter).toBeNull();
    expect(byKind.task).toMatch(`${ORIGIN}/api/practice-files/`);

    const contract = await request(app).get(`/api/interests/${practiceInterest}/documents/contract`).set(as(ownerId));
    expect(contract.status).toBe(409);
    expect(contract.body.error.message).toContain('реквизиты');
    const task = await request(app).get(`/api/interests/${practiceInterest}/documents/task`).set(as(ownerId)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(task.status).toBe(200);
    expect(task.headers['content-type']).toContain('wordprocessingml');
    expect(await docText(task.body as Buffer)).toContain('Иванова Мария');
  });

  it('профиль компании: неверный ИНН — ошибка у поля; реквизиты сохраняются и не стираются старой формой', async () => {
    const base = { companyName: 'Чайная лавка «Сафина»', city: 'Казань', contactName: 'Анна' };
    const bad = await request(app).put('/api/employer/profile').set(as(ownerId)).send({ ...base, inn: '123', ogrn: '1' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields).toMatchObject({ inn: expect.stringContaining('ИНН'), ogrn: expect.stringContaining('ОГРН') });

    const ok = await request(app).put('/api/employer/profile').set(as(ownerId)).send({ ...base, ...REQUISITES });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject(REQUISITES);
    // Форма без реквизитов (старый клиент) их не трогает
    const old = await request(app).put('/api/employer/profile').set(as(ownerId)).send({ ...base, contactName: 'Анна С.' });
    expect(old.body).toMatchObject({ contactName: 'Анна С.', inn: REQUISITES.inn });
  });

  it('управляющие символы и XML-спецсимволы в полях — файл остаётся валидным XML', async () => {
    const data = {
      company: { ...REQUISITES, legalName: 'ООО «A & B <тест>»\u000Bвторая строка\u0001' },
      companyName: 'A & B',
      vuz: vuzFor('РАНХиГС'),
      student: { fullName: 'Иванова\u000BМария', program: 'Маркетинг', course: 3 },
      place: { title: 'Задача', city: 'Казань', start: '2026-11-09', end: '2026-12-18', address: 'г. Казань' },
      date: '25.10.2026',
    };
    const zip = await JSZip.loadAsync(await buildDoc('contract', data));
    const xml = await zip.file('word/document.xml')!.async('string');
    // eslint-disable-next-line no-control-regex -- ищем именно управляющие символы
    expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    expect(xml).toContain('ООО «A &amp; B &lt;тест&gt;» вторая строка');
  });

  it('с реквизитами: договор и письмо с подстановкой, РАНХиГС из шаблона, пустое — «заполняет вуз»', async () => {
    const binary = (r: request.Test) =>
      r.buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const contract = await binary(request(app).get(`/api/interests/${practiceInterest}/documents/contract`).set(as(studentId)));
    expect(contract.status).toBe(200);
    const text = await docText(contract.body as Buffer);
    for (const v of [REQUISITES.legalName, REQUISITES.inn, REQUISITES.signerName, REQUISITES.responsibleName, 'Российская академия народного хозяйства', '7729050901', 'Маркетинг', 'с 09.11.2026 по 18.12.2026', 'заполняет вуз']) {
      expect(text).toContain(v);
    }
    const letter = await docText((await binary(request(app).get(`/api/interests/${practiceInterest}/documents/consent_letter`).set(as(ownerId)))).body as Buffer);
    expect(letter).toContain('обучающегося 3 курса по направлению Маркетинг Иванова Мария');
    expect(letter).toContain('Задача на практику: Оформить карточки чая на Wildberries.');
  });

  it('подписанная ссылка: качает без заголовка, подделка и просрочка — 404, токен не попадает в лог', async () => {
    const list = await request(app).get(`/api/interests/${practiceInterest}/documents`).set(as(ownerId));
    expect(list.body).toMatchObject({ role: 'employer', requisitesReady: true });
    const link = list.body.items.find((i: { kind: string }) => i.kind === 'contract').url as string;
    const path = link.slice(ORIGIN.length);
    const ok = await request(app).get(path);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-disposition']).toContain('attachment');

    const token = path.split('/').pop()!;
    const [body, sig] = token.split('.');
    const forged = Buffer.from(Buffer.from(body!, 'base64url').toString().replace('contract', 'review')).toString('base64url');
    expect((await request(app).get(`/api/practice-files/${forged}.${sig}`)).status).toBe(404);
    expect((await request(app).get('/api/practice-files/garbage')).status).toBe(404);

    now = new Date(now.getTime() + (LINK_TTL_SEC + 1) * 1000);
    expect((await request(app).get(path)).status).toBe(404);

    const out = lines.join('');
    expect(out).toContain('Документ практики выдан');
    for (const leak of [REQUISITES.inn, 'Иванова', 'Сафина', sig!]) expect(out).not.toContain(leak);
  });
});
