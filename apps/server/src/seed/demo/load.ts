import type { DataSource, EntityManager } from 'typeorm';
import { CONSENT_VERSION } from '../../api/routes.js';
import { matchBreakdown } from '../../matching/index.js';
import {
  DEMO_EMPLOYERS,
  DEMO_INTERNSHIPS,
  DEMO_INVITE_KEYS,
  DEMO_STUDENTS,
  type DemoEmployer,
  type DemoInternship,
  type DemoStudent,
} from './data.js';
import { planDemoInterests } from './plan.js';
import { tagsForSkills } from '../tags.js';

export interface DemoSeedResult {
  employers: number;
  internships: number;
  students: number;
  interests: number;
}

/** Что загружать. По умолчанию — всё из data.ts; другой состав нужен тесту, который повторяет загрузку на проде поверх прежней. */
export interface DemoData {
  employers: readonly DemoEmployer[];
  internships: readonly DemoInternship[];
  students: readonly DemoStudent[];
  inviteKeys: readonly string[];
}

const ALL_DEMO: DemoData = {
  employers: DEMO_EMPLOYERS,
  internships: DEMO_INTERNSHIPS,
  students: DEMO_STUDENTS,
  inviteKeys: DEMO_INVITE_KEYS,
};

/** source_id демо-стажировки. Пара (source, source_id) уникальна — по ней повторная загрузка обновляет запись. */
export const demoSourceId = (key: string) => `demo_${key}`;

async function upsertUser(
  m: EntityManager,
  u: { maxUserId: number; firstName: string; lastName: string; phone: string },
): Promise<number> {
  const rows: { id: number }[] = await m.query(
    `INSERT INTO users (max_user_id, first_name, last_name, phone, phone_saved_at, consent_at, consent_version, is_demo)
     VALUES ($1, $2, $3, $4, now(), now(), $5, true)
     ON CONFLICT (max_user_id) DO UPDATE SET
       first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, phone = EXCLUDED.phone,
       consent_version = EXCLUDED.consent_version, is_demo = true, updated_at = now()
     RETURNING id`,
    [u.maxUserId, u.firstName, u.lastName, u.phone, CONSENT_VERSION],
  );
  return rows[0]!.id;
}

/**
 * Загружает демо-данные в одной транзакции. Идемпотентно:
 * - пользователи, работодатели, анкеты и стажировки обновляются по своим уникальным ключам;
 * - отклики только добавляются: если проверяющий уже пригласил или отклонил демо-студента, повторная загрузка
 *   этого не откатит;
 * - статус стажировки (открыта или закрыта) задаётся только при первой вставке, повторная загрузка его не трогает —
 *   по той же причине.
 * Настоящие записи не затрагиваются: у демо-пользователей отрицательные max_user_id, у стажировок source = 'demo'.
 */
export async function seedDemo(ds: DataSource, data: DemoData = ALL_DEMO): Promise<DemoSeedResult> {
  const interests = planDemoInterests(data.internships, data.students, data.inviteKeys);

  let created = 0;
  await ds.transaction(async (m) => {
    const employerIds = new Map<string, number>();
    for (const e of data.employers) {
      const userId = await upsertUser(m, { maxUserId: e.maxUserId, firstName: e.contactFirstName, lastName: e.contactLastName, phone: e.phone });
      const rows: { id: number }[] = await m.query(
        `INSERT INTO employers (owner_user_id, company_name, city, contact_name, is_demo)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (owner_user_id) DO UPDATE SET
           company_name = EXCLUDED.company_name, city = EXCLUDED.city, contact_name = EXCLUDED.contact_name,
           is_demo = true, updated_at = now()
         RETURNING id`,
        [userId, e.companyName, e.city, `${e.contactFirstName} ${e.contactLastName}`],
      );
      employerIds.set(e.key, rows[0]!.id);
    }

    const internshipIds = new Map<string, number>();
    for (const i of data.internships) {
      const rows: { id: number }[] = await m.query(
        `INSERT INTO internships (employer_id, title, description, required_skills, nice_skills, format, city,
                                  starts_on, ends_on, slots, source, source_id, is_demo, tags, type, paid, salary, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'demo', $11, true, $12, $13, $14, $15, $16)
         ON CONFLICT (source, source_id) DO UPDATE SET
           employer_id = EXCLUDED.employer_id, title = EXCLUDED.title, description = EXCLUDED.description,
           required_skills = EXCLUDED.required_skills, nice_skills = EXCLUDED.nice_skills, format = EXCLUDED.format,
           city = EXCLUDED.city, starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on, slots = EXCLUDED.slots,
           tags = EXCLUDED.tags, type = EXCLUDED.type, paid = EXCLUDED.paid, salary = EXCLUDED.salary,
           is_demo = true, updated_at = now()
         RETURNING id`,
        [
          employerIds.get(i.employer)!, i.title, i.description, i.requiredSkills, i.niceSkills, i.format, i.city,
          i.startsOn, i.endsOn, i.slots, demoSourceId(i.key), tagsForSkills(i.requiredSkills), i.type, i.paid, i.salary,
          i.closed ? 'closed' : 'open',
        ],
      );
      internshipIds.set(i.key, rows[0]!.id);
    }

    const studentIds = new Map<string, number>();
    for (const s of data.students) {
      const userId = await upsertUser(m, s);
      await m.query(
        `INSERT INTO student_profiles (user_id, university, faculty, course, direction, city, formats, skills, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
         ON CONFLICT (user_id) DO UPDATE SET
           university = EXCLUDED.university, faculty = EXCLUDED.faculty, course = EXCLUDED.course,
           direction = EXCLUDED.direction, city = EXCLUDED.city, formats = EXCLUDED.formats, skills = EXCLUDED.skills,
           is_demo = true, updated_at = now()`,
        [userId, s.university, s.faculty, s.course, s.direction, s.city, s.formats, s.skills],
      );
      studentIds.set(s.key, userId);
    }

    for (const it of interests) {
      const match = matchBreakdown(it.match);
      const rows: unknown[] = await m.query(
        `INSERT INTO interests (student_user_id, internship_id, status, match_score, match, is_demo)
         VALUES ($1, $2, $3, $4, $5::jsonb, true)
         ON CONFLICT (student_user_id, internship_id) DO NOTHING
         RETURNING id`,
        [
          studentIds.get(it.student)!, internshipIds.get(it.internship)!, it.status, match.score,
          JSON.stringify(match),
        ],
      );
      created += rows.length;
    }
  });

  return {
    employers: data.employers.length,
    internships: data.internships.length,
    students: data.students.length,
    interests: created,
  };
}
