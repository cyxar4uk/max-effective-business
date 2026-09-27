import type { DataSource } from 'typeorm';
import type { Employer, Interest, Internship, Notification, StudentProfile, User } from './entities.js';
import { Employer as EmployerEntity, Interest as InterestEntity, Internship as InternshipEntity, StudentProfile as StudentEntity, User as UserEntity } from './entities.js';

// Данные для модуля bot (Тимур). Бот получает из событий только id и читает актуальное отсюда.
// Отправка идёт через очередь в таблице notifications: enqueue → claimDue → markSent / markRetry / markFailed.

export interface Recipient {
  userId: number;
  maxUserId: number;
  firstName: string | null;
  isDemo: boolean;
}

export interface StudentCandidate {
  user: Recipient;
  profile: StudentProfile;
}

export interface InterestContext {
  interest: Interest;
  internship: Internship;
  employer: Employer | null;
  student: StudentCandidate & { phone: string | null; lastName: string | null };
  // Владелец компании: ему уходят уведомления работодателя. null — стажировка импортирована, работодателя в системе нет
  employerOwner: (Recipient & { phone: string | null }) | null;
}

export interface EnqueueInput {
  userId: number;
  kind: string;
  // Ключ идемпотентности, например `internship:12:student:5`. Повтор с тем же ключом не создаёт вторую запись.
  dedupeKey: string;
  payload: Record<string, unknown>;
}

function recipient(u: User): Recipient {
  return { userId: u.id, maxUserId: u.maxUserId, firstName: u.firstName, isDemo: u.isDemo };
}

export function createBotData(ds: DataSource) {
  const users = ds.getRepository(UserEntity);

  return {
    async internship(internshipId: number): Promise<{ internship: Internship; employer: Employer | null } | null> {
      const internship = await ds.getRepository(InternshipEntity).findOneBy({ id: internshipId });
      if (!internship) return null;
      const employer = internship.employerId ? await ds.getRepository(EmployerEntity).findOneBy({ id: internship.employerId }) : null;
      return { internship, employer };
    },

    // Все студенты с анкетой, кроме автора стажировки. Фильтры и порог — в matching, здесь только выборка.
    async studentsWithProfiles(excludeUserId?: number): Promise<StudentCandidate[]> {
      const rows = await ds
        .getRepository(StudentEntity)
        .createQueryBuilder('p')
        .innerJoinAndMapOne('p.user', UserEntity, 'u', 'u.id = p.user_id')
        .where(excludeUserId ? 'p.user_id <> :ex' : 'TRUE', { ex: excludeUserId })
        .getMany();
      return rows.map((p) => ({ user: recipient((p as StudentProfile & { user: User }).user), profile: p }));
    },

    async interestContext(interestId: number): Promise<InterestContext | null> {
      const interest = await ds.getRepository(InterestEntity).findOneBy({ id: interestId });
      if (!interest) return null;
      const [internship, studentUser, profile] = await Promise.all([
        ds.getRepository(InternshipEntity).findOneByOrFail({ id: interest.internshipId }),
        users.findOneByOrFail({ id: interest.studentUserId }),
        ds.getRepository(StudentEntity).findOneBy({ userId: interest.studentUserId }),
      ]);
      if (!profile) return null;
      const employer = internship.employerId ? await ds.getRepository(EmployerEntity).findOneBy({ id: internship.employerId }) : null;
      const owner = employer ? await users.findOneBy({ id: employer.ownerUserId }) : null;
      return {
        interest,
        internship,
        employer,
        student: { user: recipient(studentUser), profile, phone: studentUser.phone, lastName: studentUser.lastName },
        employerOwner: owner ? { ...recipient(owner), phone: owner.phone } : null,
      };
    },

    async userByMaxId(maxUserId: number): Promise<Recipient | null> {
      const u = await users.findOneBy({ maxUserId });
      return u ? recipient(u) : null;
    },

    // true — поставлено в очередь, false — такое уведомление уже было
    async enqueue(n: EnqueueInput): Promise<boolean> {
      const rows: unknown[] = await ds.query(
        `INSERT INTO notifications (user_id, kind, dedupe_key, payload) VALUES ($1, $2, $3, $4)
         ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
        [n.userId, n.kind, n.dedupeKey, JSON.stringify(n.payload)],
      );
      return rows.length > 0;
    },

    // Взять до limit уведомлений, у которых подошло время. Запись арендуется на leaseSec: если процесс упадёт
    // до markSent/markRetry, она вернётся в очередь сама. SKIP LOCKED — параллельные вызовы не возьмут одно и то же.
    async claimDue(limit: number, leaseSec = 60): Promise<(Notification & { maxUserId: number; isDemo: boolean })[]> {
      const [rows] = (await ds.query(
        `WITH due AS (
           SELECT id FROM notifications
           WHERE status = 'pending' AND next_attempt_at <= now()
           ORDER BY next_attempt_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE notifications n
         SET attempts = n.attempts + 1, next_attempt_at = now() + make_interval(secs => $2)
         FROM due, users u
         WHERE n.id = due.id AND u.id = n.user_id
         RETURNING n.id, n.user_id, n.kind, n.dedupe_key, n.payload, n.attempts, u.max_user_id, u.is_demo`,
        [limit, leaseSec],
      )) as [Record<string, unknown>[], number];
      // UPDATE … RETURNING не гарантирует порядок строк: сортируем по id, чтобы сообщения одному человеку
      // уходили в порядке постановки в очередь
      rows.sort((a, b) => (a.id as number) - (b.id as number));
      return rows.map((r) => ({
        id: r.id as number,
        userId: r.user_id as number,
        kind: r.kind as string,
        dedupeKey: r.dedupe_key as string | null,
        payload: r.payload as Record<string, unknown>,
        attempts: r.attempts as number,
        maxUserId: r.max_user_id as number,
        isDemo: r.is_demo as boolean,
      })) as (Notification & { maxUserId: number; isDemo: boolean })[];
    },

    // После отправки текст больше не нужен, а в нём бывают телефоны: payload очищаем (минимум хранимых ПД)
    async markSent(id: number): Promise<void> {
      await ds.query(`UPDATE notifications SET status = 'sent', sent_at = now(), last_error = NULL, payload = '{}' WHERE id = $1`, [id]);
    },

    // Временная ошибка (429, 5xx, сеть): повторить через delaySec
    async markRetry(id: number, error: string, delaySec: number): Promise<void> {
      await ds.query(
        `UPDATE notifications SET last_error = $2, next_attempt_at = now() + make_interval(secs => $3) WHERE id = $1`,
        [id, error.slice(0, 1000), delaySec],
      );
    },

    // Окончательная ошибка (403 — пользователь остановил бота, исчерпаны попытки). Текст тоже очищаем.
    async markFailed(id: number, error: string): Promise<void> {
      await ds.query(`UPDATE notifications SET status = 'failed', last_error = $2, payload = '{}' WHERE id = $1`, [id, error.slice(0, 1000)]);
    },
  };
}

export type BotData = ReturnType<typeof createBotData>;
