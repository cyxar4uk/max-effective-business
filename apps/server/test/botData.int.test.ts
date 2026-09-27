// Слой данных бота на настоящем PostgreSQL (см. scenario.int.test.ts про TEST_DATABASE_URL).
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBotData, type BotData } from '../src/db/botData.js';
import { createDataSource } from '../src/db/dataSource.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('botData', () => {
  let ds: DataSource;
  let bot: BotData;
  const ids = { employerUser: 0, student: 0, other: 0, internship: 0, interest: 0 };

  beforeAll(async () => {
    ds = createDataSource(url!);
    await ds.initialize();
    await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await ds.runMigrations();
    bot = createBotData(ds);

    const [[e], [s], [o]] = await Promise.all(
      [
        [300001, 'Ольга', '+79990000001', false],
        [300002, 'Анна', '+79990000002', false],
        [300003, 'Демо', null, true],
      ].map((u) => ds.query('INSERT INTO users (max_user_id, first_name, phone, is_demo) VALUES ($1,$2,$3,$4) RETURNING id', u)),
    );
    Object.assign(ids, { employerUser: e.id, student: s.id, other: o.id });
    const [emp] = await ds.query(`INSERT INTO employers (owner_user_id, company_name, city, contact_name) VALUES ($1,'Вектор','Москва','Ольга') RETURNING id`, [e.id]);
    for (const uid of [s.id, o.id, e.id]) {
      await ds.query(`INSERT INTO student_profiles (user_id, university, course, direction, city, formats, skills) VALUES ($1,'РАНХиГС',3,'БИ','Москва','{office}','{excel}')`, [uid]);
    }
    const [i] = await ds.query(`INSERT INTO internships (employer_id, title, required_skills, format, city) VALUES ($1,'Аналитик','{excel}','office','Москва') RETURNING id`, [emp.id]);
    ids.internship = i.id;
    const [x] = await ds.query(`INSERT INTO interests (student_user_id, internship_id, status, match_score, match) VALUES ($1,$2,'invited',100,'{}') RETURNING id`, [s.id, i.id]);
    ids.interest = x.id;
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('стажировка с работодателем', async () => {
    const r = await bot.internship(ids.internship);
    expect(r?.employer?.companyName).toBe('Вектор');
    expect(await bot.internship(999999)).toBeNull();
  });

  it('студенты с анкетами, без автора стажировки', async () => {
    const list = await bot.studentsWithProfiles(ids.employerUser);
    expect(list.map((s) => s.user.maxUserId).sort()).toEqual([300002, 300003]);
    expect(list.find((s) => s.user.maxUserId === 300003)?.user.isDemo).toBe(true);
    expect(list[0]!.profile.skills).toEqual(['excel']);
    expect(await bot.studentsWithProfiles()).toHaveLength(3);
  });

  it('контекст отклика: обе стороны с контактами', async () => {
    const c = await bot.interestContext(ids.interest);
    expect(c?.student).toMatchObject({ user: { maxUserId: 300002 }, phone: '+79990000002' });
    expect(c?.employerOwner).toMatchObject({ maxUserId: 300001, phone: '+79990000001' });
    expect(c?.employer?.contactName).toBe('Ольга');
  });

  it('очередь: без дублей, аренда, повтор, итог', async () => {
    const n = { userId: ids.student, kind: 'invited', dedupeKey: `invite:${ids.interest}:student`, payload: { a: 1 } };
    expect(await bot.enqueue(n)).toBe(true);
    expect(await bot.enqueue(n)).toBe(false);
    await bot.enqueue({ ...n, userId: ids.other, dedupeKey: 'x:demo' });

    const [first, second] = await Promise.all([bot.claimDue(10), bot.claimDue(10)]);
    const claimed = [...first, ...second];
    expect(claimed).toHaveLength(2);
    expect(claimed.find((c) => c.dedupeKey === n.dedupeKey)).toMatchObject({ maxUserId: 300002, attempts: 1, payload: { a: 1 }, isDemo: false });
    // Арендованные повторно не выдаются
    expect(await bot.claimDue(10)).toHaveLength(0);

    const main = claimed.find((c) => c.dedupeKey === n.dedupeKey)!;
    await bot.markRetry(main.id, 'HTTP 429', 0);
    const again = await bot.claimDue(10);
    expect(again.map((c) => [c.id, c.attempts])).toEqual([[main.id, 2]]);
    await bot.markSent(main.id);

    const demo = claimed.find((c) => c.dedupeKey === 'x:demo')!;
    await bot.markFailed(demo.id, 'HTTP 403');
    const rows = await ds.query('SELECT dedupe_key, status, last_error, sent_at IS NOT NULL AS sent, payload FROM notifications ORDER BY id');
    // После отправки и после окончательной ошибки текста (с телефонами) в базе нет
    expect(rows).toEqual([
      { dedupe_key: n.dedupeKey, status: 'sent', last_error: null, sent: true, payload: {} },
      { dedupe_key: 'x:demo', status: 'failed', last_error: 'HTTP 403', sent: false, payload: {} },
    ]);
  });

  it('claimDue отдаёт уведомления в порядке постановки в очередь', async () => {
    const keys = ['order:1', 'order:2', 'order:3', 'order:4', 'order:5'];
    for (const k of keys) await bot.enqueue({ userId: ids.student, kind: 'k', dedupeKey: k, payload: { k } });
    const claimed = await bot.claimDue(10);
    const ours = claimed.filter((c) => c.dedupeKey?.startsWith('order:'));
    expect(ours.map((c) => c.dedupeKey)).toEqual(keys);
    expect(claimed.map((c) => c.id)).toEqual([...claimed.map((c) => c.id)].sort((a, b) => a - b));
    for (const c of claimed) await bot.markSent(c.id);
  });

  it('аренда истекает — запись возвращается в очередь', async () => {
    await bot.enqueue({ userId: ids.student, kind: 'k', dedupeKey: 'lease', payload: {} });
    expect(await bot.claimDue(10, 0)).toHaveLength(1);
    expect(await bot.claimDue(10)).toHaveLength(1);
  });
});
