// Метрики пилота на настоящем PostgreSQL. Запуск — как у сквозного теста:
//   TEST_DATABASE_URL=postgres://app:pass@localhost:5432/app_test npm test
// Собственная схема pilot_metrics_test; демо-данные загружаются, чтобы проверить, что они в метрики не попадают.
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataSource } from '../src/db/dataSource.js';
import { collectPilotMetrics, parsePeriod } from '../src/metrics/pilot.js';
import { seedDemo, seedSkills } from '../src/seed/index.js';

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = 'pilot_metrics_test';

function withSearchPath(base: string): string {
  const u = new URL(base);
  u.searchParams.set('options', `-c search_path=${SCHEMA}`);
  return u.toString();
}

describe.skipIf(!url)('метрики пилота', () => {
  let ds: DataSource;

  const user = async (maxId: number) => (await ds.query(`INSERT INTO users (max_user_id, first_name) VALUES ($1, 'Тест') RETURNING id`, [maxId]))[0].id as number;
  const student = async (maxId: number, createdAt: string) => {
    const id = await user(maxId);
    await ds.query(
      `INSERT INTO student_profiles (user_id, university, course, direction, city, formats, skills, created_at)
       VALUES ($1, 'РАНХиГС', 3, 'БИ', 'Москва', '{remote}', '{excel}', $2)`,
      [id, createdAt],
    );
    return id;
  };
  const place = async (employerId: number, createdAt: string, source = 'employer') =>
    (
      await ds.query(
        `INSERT INTO internships (employer_id, company_name, title, required_skills, format, source, source_id, created_at)
         VALUES ($1, 'Компания', 'Место', '{excel}', 'remote', $2, $3, $4) RETURNING id`,
        [source === 'employer' ? employerId : null, source, source === 'employer' ? null : `t_${createdAt}`, createdAt],
      )
    )[0].id as number;
  const interest = async (
    studentId: number,
    placeId: number,
    score: number,
    interestedAt: string | null,
    status = 'interested',
    updatedAt?: string,
    match: object = {},
  ) =>
    ds.query(
      `INSERT INTO interests (student_user_id, internship_id, status, match_score, match, interested_at, updated_at)
       VALUES ($1, $2, $3, $4, $7::jsonb, $5, COALESCE($6::timestamptz, now()))`,
      [studentId, placeId, status, score, interestedAt, updatedAt ?? null, JSON.stringify(match)],
    );
  // Аккаунт команды: его анкета и отклики в метрики не идут (METRICS_EXCLUDE_MAX_IDS)
  const TEAM = 999;
  // «Сейчас» для расчёта — после всех событий: у всех мест 2 рабочих дня прошли, всем откликам больше суток
  const NOW = new Date('2026-11-20T12:00:00+03:00');
  const opts = { excludeMaxIds: [TEAM], now: NOW };

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

    const owner = await user(900);
    const [emp] = await ds.query(`INSERT INTO employers (owner_user_id, company_name, city, contact_name) VALUES ($1, 'Вектор', 'Москва', 'Ольга') RETURNING id`, [owner]);

    const s1 = await student(901, '2026-10-02T12:00:00+03:00');
    const s2 = await student(902, '2026-10-03T12:00:00+03:00');
    await student(903, '2026-10-04T12:00:00+03:00'); // анкета есть, «Интересно» нет
    const s4 = await student(904, '2026-11-02T12:00:00+03:00'); // вне периода

    // Понедельник 10:00: подходящий отклик через 5 ч; отклик на 50 % раньше него не считается подходящим
    const p1 = await place(emp.id, '2026-10-05T10:00:00+03:00');
    await interest(s1, p1, 90, '2026-10-05T15:00:00+03:00', 'invited', '2026-10-08T12:00:00+03:00');
    await interest(s2, p1, 50, '2026-10-05T11:00:00+03:00');
    // Пятница 15:00: отклик во вторник 12:00 — 93 ч, но в пределах 2 рабочих дней
    const p2 = await place(emp.id, '2026-10-09T15:00:00+03:00');
    await interest(s1, p2, 65, '2026-10-13T12:00:00+03:00');
    // Без откликов; «Пропустить» (interested_at пустой) не считается
    const p3 = await place(emp.id, '2026-10-06T09:00:00+03:00');
    await interest(s2, p3, 95, null, 'skipped');
    // Вне периода
    const p4 = await place(emp.id, '2026-11-10T10:00:00+03:00');
    await interest(s4, p4, 80, '2026-11-10T12:00:00+03:00', 'invited', '2026-11-11T12:00:00+03:00');
    // «Работа России» — не место работодателя, но «Интересно» на него учитывается
    const t = await place(emp.id, '2026-10-01T09:00:00+03:00', 'trudvsem');
    await interest(s2, t, 75, '2026-10-07T12:00:00+03:00');
    // Настоящий студент на демо-месте, демо-компания пригласила его сама через 20 с (#100): в метрики не идёт —
    // ни в отклики, ни в приглашения, ни во время ответа работодателя
    const [demo] = await ds.query(`SELECT id FROM internships WHERE source = 'demo' ORDER BY id LIMIT 1`);
    await interest(s1, demo.id, 85, '2026-10-06T12:00:00+03:00', 'invited', '2026-10-06T12:00:20+03:00');

    // #125. Самоотзыв: владелец откликнулся на своё место раньше всех (так проверяют сценарий одним аккаунтом) —
    // не подходящий отклик и не отклик вообще
    await interest(owner, p1, 100, '2026-10-05T10:30:00+03:00');
    // Аккаунт команды откликнулся на p2 через час — при исключении не считается
    const team = await student(TEAM, '2026-10-03T12:00:00+03:00');
    await interest(team, p2, 100, '2026-10-09T16:00:00+03:00');
    // 70 %, но без обязательного навыка — не «подходящий» (бот такому не пишет); как отклик и «без решения» считается
    const s3 = (await ds.query('SELECT id FROM users WHERE max_user_id = 903'))[0].id as number;
    await interest(s3, p3, 70, '2026-10-06T10:00:00+03:00', 'interested', undefined, { mustMissing: ['sql'] });
  });

  afterAll(async () => {
    await ds?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await ds?.destroy();
  });

  it('за октябрь: без демо, импорта и записей вне периода', async () => {
    const m = await collectPilotMetrics(ds, parsePeriod(['--from', '2026-10-01', '--to', '2026-10-31']), opts);
    expect(m).toEqual({
      places: 3,
      // p1 — 5 ч (самоотзыв в 10:30 не в счёт), p2 — 93 ч (команда через час не в счёт), p3 — подходящего нет:
      // 70 % без обязательного. У всех трёх 2 рабочих дня прошли — главная доля 2 из 3, а не 2 из 2
      firstMatch: { eligible: 3, withinTarget: 2, withResponse: 2, medianHours: 49 },
      // s1-p1 90, s2-p1 50, s1-p2 65, s2-«Работа России» 75, s3-p3 70; без самоотзыва, команды и демо
      interests: { total: 5, strong: 3 },
      // Только места работодателей: приглашён s1-p1 через 69 ч; без решения больше суток — s2-p1, s1-p2, s3-p3
      decisions: { invited: 1, declined: 0, olderThan24h: 4, pendingOver24h: 3, decidedWithin24h: 0, medianHours: 69 },
      // Анкеты s1, s2, s3 (команда исключена); у всех троих есть «Интересно»
      funnel: { profiles: 3, interested: 3 },
      invitations: 1,
      bands: [
        { band: '80+', interested: 1, invited: 1 },
        // 70 % у s3-p3; отклик на 75 % — на место «Работа России», в разрез решений работодателя не входит
        { band: '70–79', interested: 1, invited: 0 },
        { band: '60–69', interested: 1, invited: 0 },
        { band: '<60', interested: 1, invited: 0 },
      ],
    });
  });

  it('без исключения команды её отклик становится первым подходящим — поэтому её и исключаем', async () => {
    const m = await collectPilotMetrics(ds, parsePeriod(['--from', '2026-10-01', '--to', '2026-10-31']), { now: NOW });
    // p2: команда через 1 ч вместо студента через 93 ч → медиана (5 + 1) / 2
    expect(m.firstMatch.medianHours).toBe(3);
    expect(m.funnel.profiles).toBe(4);
  });

  it('порог «подходящего» — из настроек: при 70 % отклик на 65 % уже не подходящий', async () => {
    const m = await collectPilotMetrics(ds, parsePeriod(['--from', '2026-10-01', '--to', '2026-10-31']), { ...opts, threshold: 70 });
    expect(m.firstMatch).toEqual({ eligible: 3, withinTarget: 1, withResponse: 1, medianHours: 5 });
  });

  it('без периода — всё настоящее, демо по-прежнему не считается', async () => {
    const m = await collectPilotMetrics(ds, parsePeriod([]), opts);
    expect(m.places).toBe(4);
    // + p4: подходящий отклик через 2 ч
    expect(m.firstMatch).toEqual({ eligible: 4, withinTarget: 3, withResponse: 3, medianHours: 5 });
    expect(m.interests.total).toBe(6);
    // + приглашение на p4 через 24 ч: медиана (69 + 24) / 2, решено за сутки — одно
    expect(m.decisions).toMatchObject({ invited: 2, declined: 0, decidedWithin24h: 1, medianHours: 46.5 });
    expect(m.funnel).toEqual({ profiles: 4, interested: 4 });
    expect(m.invitations).toBe(2);
    expect(m.bands[0]).toEqual({ band: '80+', interested: 2, invited: 2 });
  });
});
