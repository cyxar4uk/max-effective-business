import { Router } from 'express';
import { In, type EntityManager } from 'typeorm';
import { currentUser } from '../auth/middleware.js';
import { Interest, Internship, StudentProfile, TaskTag, User } from '../db/entities.js';
import type { InterestStatus } from '../db/entities.js';
// Порядок ленты — чистые функции подбора (Тимур); сам процент по-прежнему считает внедрённый matcher
import { compareForFeed, practiceMonthFits } from '../matching/match.js';
import { assertSkills, assertTags, ownInternship, requireEmployer, requireStudent, type DomainDeps } from './context.js';
import { ApiError, parse } from './errors.js';
import { employerAction, studentAction } from './interestFsm.js';
import { feedQuery, idParam, interestBody, internshipBody, internshipPatch, internshipRules } from './schemas.js';
import { employersById, interestSummary, internshipView } from './views.js';

const FEED_LIMIT = 50;
// Сколько мест лента разбирает за раз после фильтров SQL: защита от раздутой таблицы
const FEED_SCAN_LIMIT = 500;
// Открытых мест у одного работодателя: защита от спама и раздувания ленты
export const MAX_OPEN_PER_EMPLOYER = 20;

export function internshipsRouter({ ds, matcher, events }: DomainDeps): Router {
  const r = Router();
  const internships = ds.getRepository(Internship);
  const interests = ds.getRepository(Interest);

  async function assertOpenLimit(employerId: number): Promise<void> {
    const open = await internships.countBy({ employerId, status: 'open' });
    if (open >= MAX_OPEN_PER_EMPLOYER) {
      throw new ApiError('CONFLICT', `Открыто уже ${MAX_OPEN_PER_EMPLOYER} мест — закройте ненужные, чтобы опубликовать новое`);
    }
  }

  // ---------- работодатель ----------

  r.post('/internships', async (req, res) => {
    const employer = await requireEmployer(ds, currentUser(req).id);
    const body = parse(internshipBody, req.body);
    const rules = internshipRules(body);
    if (Object.keys(rules).length) throw new ApiError('VALIDATION_ERROR', 'Проверьте заполнение полей', rules);
    await assertSkills(ds, { requiredSkills: body.requiredSkills, niceSkills: body.niceSkills });
    await assertTags(ds, body.tags);
    await assertOpenLimit(employer.id);

    const inserted = await internships.save(internships.create({ ...body, employerId: employer.id, source: 'employer' }));
    // save() возвращает сгенерированный bigint строкой в обход парсера pg — перечитываем запись: id станет числом,
    // а значения по умолчанию из БД (created_at и др.) — настоящими
    const saved = await internships.findOneByOrFail({ id: Number(inserted.id) });
    events.emit('internship.created', { internshipId: saved.id });
    res.status(201).json(internshipView(saved, employer, { isOwner: true }));
  });

  r.get('/employer/internships', async (req, res) => {
    const employer = await requireEmployer(ds, currentUser(req).id);
    const list = await internships.find({ where: { employerId: employer.id }, order: { createdAt: 'DESC' } });
    const counts: { internship_id: number; status: InterestStatus; n: number }[] = list.length
      ? await ds.query(
          `SELECT internship_id, status, count(*) AS n FROM interests
           WHERE internship_id = ANY($1) AND status <> 'skipped' GROUP BY internship_id, status`,
          [list.map((i) => i.id)],
        )
      : [];
    res.json({
      items: list.map((i) => {
        const c = { interested: 0, invited: 0, declined: 0 };
        for (const row of counts) if (row.internship_id === i.id) c[row.status as keyof typeof c] = row.n;
        return { ...internshipView(i, employer, { isOwner: true }), counts: c };
      }),
    });
  });

  r.patch('/internships/:id', async (req, res) => {
    const { internship, employer } = await ownInternship(ds, currentUser(req).id, parse(idParam, req.params.id));
    const patch = parse(internshipPatch, req.body);
    // Место неоплачиваемое — суммы нет, даже если форма прислала старую
    if (patch.paid === false) patch.salary = null;
    const merged = { ...internship, ...patch };
    const rules = internshipRules(merged, new Set(Object.keys(patch)));
    if (Object.keys(rules).length) throw new ApiError('VALIDATION_ERROR', 'Проверьте заполнение полей', rules);
    await assertSkills(ds, { requiredSkills: patch.requiredSkills ?? [], niceSkills: patch.niceSkills ?? [] });
    await assertTags(ds, patch.tags ?? []);
    if (patch.status === 'open' && internship.status !== 'open') await assertOpenLimit(employer.id);
    const saved = await internships.save(internships.merge(internship, patch));
    // Сменились требования — у тех, кто ждёт решения, пересчитываем процент: иначе у кандидатов остаётся старый (#102).
    // Приглашённых и отказанных не трогаем — решение уже принято по тому проценту
    if (['requiredSkills', 'niceSkills', 'format', 'city'].some((k) => k in patch)) {
      const waiting = (await ds.query(
        `SELECT x.id, p.skills, p.formats, p.city
         FROM interests x JOIN student_profiles p ON p.user_id = x.student_user_id
         WHERE x.internship_id = $1 AND x.status = 'interested'`,
        [saved.id],
      )) as { id: number; skills: string[]; formats: StudentProfile['formats']; city: string }[];
      for (const w of waiting) {
        const { match } = matcher({ skills: w.skills, formats: w.formats, city: w.city }, saved);
        await ds.query('UPDATE interests SET match_score = $2, match = $3::jsonb WHERE id = $1', [w.id, match.score, JSON.stringify(match)]);
      }
    }
    res.json(internshipView(saved, employer, { isOwner: true }));
  });

  r.get('/internships/:id/candidates', async (req, res) => {
    const { internship } = await ownInternship(ds, currentUser(req).id, parse(idParam, req.params.id));
    const rows: CandidateRow[] = await ds.query(
      `SELECT i.status, i.match, i.is_demo, COALESCE(i.interested_at, i.created_at) AS interested_at,
              u.id AS student_id, u.first_name, u.last_name, u.phone,
              sp.university, sp.course, sp.direction, sp.city
       FROM interests i
       JOIN users u ON u.id = i.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE i.internship_id = $1 AND i.status <> 'skipped'
       ORDER BY i.match_score DESC, i.created_at ASC`,
      [internship.id],
    );
    res.json({ items: rows.map(candidateView) });
  });

  for (const [path, action] of [['invite', 'invited'], ['decline', 'declined']] as const) {
    r.post(`/internships/:id/candidates/:studentId/${path}`, async (req, res) => {
      const { internship } = await ownInternship(ds, currentUser(req).id, parse(idParam, req.params.id));
      const studentId = parse(idParam, req.params.studentId);

      const result = await ds.transaction(async (m) => {
        const interest = await lockInterest(m, studentId, internship.id);
        // «Пропустить» работодатель не видит, поэтому для него такого кандидата нет
        if (!interest || interest.status === 'skipped') throw new ApiError('NOT_FOUND', 'Этот студент не откликался на стажировку');
        const t = employerAction(interest.status, action);
        if (!t.ok) throw new ApiError('CONFLICT', t.message);
        if (t.changed && action === 'invited') {
          // Мест не больше, чем slots (#102). Блокируем место, чтобы два параллельных приглашения не прошли оба.
          // Тестовые студенты места не занимают: проверяющий может пригласить демо-кандидата, а потом себя — сценарий
          // «одним аккаунтом» не упирается в лимит. Приглашать тестового студента сверх мест тоже можно
          await m.query('SELECT id FROM internships WHERE id = $1 FOR UPDATE', [internship.id]);
          const [row] = (await m.query(
            `SELECT count(*)::int AS n FROM interests WHERE internship_id = $1 AND status = 'invited' AND NOT is_demo`,
            [internship.id],
          )) as { n: number }[];
          const n = row?.n ?? 0;
          if (!interest.isDemo && n >= internship.slots) {
            throw new ApiError('CONFLICT', `Все места уже заняты: приглашено ${n} из ${internship.slots}. Увеличьте число мест или закройте набор`);
          }
        }
        if (t.changed) await m.update(Interest, { id: interest.id }, { status: t.next });
        return { interestId: interest.id, changed: t.changed };
      });

      if (result.changed && action === 'invited') {
        events.emit('interest.invited', { interestId: result.interestId, internshipId: internship.id, studentUserId: studentId });
      }
      const [row] = (await ds.query(
        `SELECT i.status, i.match, i.is_demo, COALESCE(i.interested_at, i.created_at) AS interested_at,
                u.id AS student_id, u.first_name, u.last_name, u.phone,
                sp.university, sp.course, sp.direction, sp.city
         FROM interests i JOIN users u ON u.id = i.student_user_id
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE i.id = $1`,
        [result.interestId],
      )) as CandidateRow[];
      res.json(candidateView(row!));
    });
  }

  // ---------- справочник тегов задач ----------

  r.get('/tags', async (_req, res) => {
    const tags = await ds.getRepository(TaskTag).find({ order: { sort: 'ASC', code: 'ASC' } });
    res.json({ items: tags.map((t) => ({ code: t.code, name: t.name, skills: t.skills })) });
  });

  // ---------- студент ----------

  r.get('/student/feed', async (req, res) => {
    const user = currentUser(req);
    const student = await requireStudent(ds, user.id);
    const { tags } = parse(feedQuery, req.query);
    // Грубые фильтры — в SQL, чтобы не тащить в память всю таблицу: формат студента; хотя бы один общий навык
    // (иначе совпадение 0 %) или место без требований; теги. Город и точный процент — в matcher.
    const q = internships
      .createQueryBuilder('i')
      .where(`i.status = 'open'`)
      // Место, у которого срок уже прошёл, в ленту не попадает (#102)
      .andWhere('(i.ends_on IS NULL OR i.ends_on >= current_date)')
      .andWhere('NOT EXISTS (SELECT 1 FROM interests x WHERE x.internship_id = i.id AND x.student_user_id = :uid)', { uid: user.id })
      .andWhere('i.format = ANY(:formats::text[])', { formats: student.formats })
      .andWhere(
        '(i.required_skills && :skills::text[] OR i.nice_skills && :skills::text[] OR (cardinality(i.required_skills) = 0 AND cardinality(i.nice_skills) = 0))',
        { skills: student.skills },
      );
    // Теги только фильтруют ленту, в расчёте совпадения не участвуют
    if (tags.length) q.andWhere('i.tags && :tags::text[]', { tags });
    const open = await q.orderBy('i.created_at', 'DESC').limit(FEED_SCAN_LIMIT).getMany();

    const suitable = open
      .map((i) => ({ i, ...matcher(student, i) }))
      .filter((x) => x.eligible && x.match.score > 0)
      // Процент, затем закрыты ли все обязательные, затем месяц практики (matching/compareForFeed)
      .map((x) => ({ ...x, datesFit: practiceMonthFits(student.practiceMonth, x.i.startsOn, x.i.endsOn) }))
      .sort(compareForFeed)
      .slice(0, FEED_LIMIT);
    const employers = await employersById(ds, suitable.map((x) => x.i));
    res.json({
      items: suitable.map((x) =>
        internshipView(x.i, employers.get(x.i.employerId ?? -1), { match: x.match, myInterest: null }),
      ),
    });
  });

  r.get('/internships/:id', async (req, res) => {
    const user = currentUser(req);
    const internship = await internships.findOneBy({ id: parse(idParam, req.params.id) });
    if (!internship) throw new ApiError('NOT_FOUND', 'Стажировка не найдена');
    const employers = await employersById(ds, [internship]);
    const employer = employers.get(internship.employerId ?? -1);
    const student = await ds.getRepository(StudentProfile).findOneBy({ userId: user.id });
    const extra = student
      ? {
          match: matcher(student, internship).match,
          myInterest: (await interests.findOneBy({ studentUserId: user.id, internshipId: internship.id }))?.status ?? null,
        }
      : {};
    res.json(internshipView(internship, employer, { ...extra, isOwner: employer?.ownerUserId === user.id }));
  });

  r.post('/internships/:id/interest', async (req, res) => {
    const user = currentUser(req);
    const student = await requireStudent(ds, user.id);
    const { action } = parse(interestBody, req.body);
    const internship = await internships.findOneBy({ id: parse(idParam, req.params.id) });
    if (!internship) throw new ApiError('NOT_FOUND', 'Стажировка не найдена');
    const { match } = matcher(student, internship);

    const closed = internship.status !== 'open' && action === 'interested';
    const result = await ds.transaction(async (m) => {
      let interest = await lockInterest(m, user.id, internship.id);
      if (!interest) {
        if (closed) throw new ApiError('CONFLICT', 'Стажировка закрыта');
        const inserted: { id: number }[] = await m.query(
          `INSERT INTO interests (student_user_id, internship_id, status, match_score, match, interested_at)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $3 = 'interested' THEN now() END)
           ON CONFLICT (student_user_id, internship_id) DO NOTHING RETURNING id`,
          [user.id, internship.id, action, match.score, JSON.stringify(match)],
        );
        if (inserted[0]) return { interestId: inserted[0].id, changed: true };
        // Параллельный запрос успел вставить первым — дальше как с существующим откликом
        interest = await lockInterest(m, user.id, internship.id);
      }
      const t = studentAction(interest!.status, action);
      if (!t.ok) throw new ApiError('CONFLICT', t.message);
      if (t.changed) {
        if (closed) throw new ApiError('CONFLICT', 'Стажировка закрыта');
        await m.update(Interest, { id: interest!.id }, {
          status: t.next,
          matchScore: match.score,
          match,
          // Время первого «Интересно» не сдвигаем при повторных переключениях
          ...(t.next === 'interested' ? { interestedAt: () => 'COALESCE(interested_at, now())' } : {}),
        });
      }
      return { interestId: interest!.id, changed: t.changed };
    });

    if (result.changed) {
      events.emit('interest.created', { interestId: result.interestId, internshipId: internship.id, studentUserId: user.id, status: action });
    }
    res.json({ status: action, match });
  });

  r.get('/student/interests', async (req, res) => {
    const user = currentUser(req);
    const list = await interests
      .createQueryBuilder('x')
      .where('x.student_user_id = :uid', { uid: user.id })
      .andWhere(`x.status <> 'skipped'`)
      .orderBy('x.updated_at', 'DESC')
      .getMany();
    // findBy([]) в TypeORM — запрос без WHERE, поэтому пустой список обрабатываем отдельно
    if (!list.length) {
      res.json({ items: [] });
      return;
    }
    const byId = new Map((await internships.findBy({ id: In(list.map((x) => x.internshipId)) })).map((i) => [i.id, i]));
    const employers = await employersById(ds, [...byId.values()]);
    // Контакт работодателя — только после приглашения
    const invitedOwners = list
      .filter((x) => x.status === 'invited')
      .map((x) => employers.get(byId.get(x.internshipId)?.employerId ?? -1)?.ownerUserId)
      .filter((id): id is number => id !== undefined);
    const owners = new Map(
      (invitedOwners.length ? await ds.getRepository(User).findBy({ id: In(invitedOwners) }) : []).map((u) => [u.id, u]),
    );

    res.json({
      items: list.flatMap((x) => {
        const i = byId.get(x.internshipId);
        if (!i) return [];
        const employer = employers.get(i.employerId ?? -1);
        const owner = x.status === 'invited' && employer ? owners.get(employer.ownerUserId) : undefined;
        return [
          {
            ...interestSummary(x),
            internship: internshipView(i, employer),
            employerContact: owner && employer ? { name: employer.contactName, phone: owner.phone } : null,
          },
        ];
      }),
    });
  });

  return r;
}

async function lockInterest(m: EntityManager, studentUserId: number, internshipId: number): Promise<Interest | null> {
  return m
    .getRepository(Interest)
    .createQueryBuilder('x')
    .setLock('pessimistic_write')
    .where('x.student_user_id = :s AND x.internship_id = :i', { s: studentUserId, i: internshipId })
    .getOne();
}

interface CandidateRow {
  status: InterestStatus;
  match: unknown;
  is_demo: boolean;
  interested_at: Date;
  student_id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  university: string | null;
  course: number | null;
  direction: string | null;
  city: string | null;
}

// Телефон и фамилия раскрываются только после приглашения (взаимный интерес)
function candidateView(row: CandidateRow) {
  const invited = row.status === 'invited';
  return {
    studentId: row.student_id,
    firstName: row.first_name,
    lastName: invited ? row.last_name : null,
    university: row.university,
    course: row.course,
    direction: row.direction,
    city: row.city,
    status: row.status,
    match: row.match,
    phone: invited ? row.phone : null,
    // Первое «Интересно»; у откликов из демо-данных и до 29.09 — время создания отклика
    interestedAt: row.interested_at.toISOString(),
    isDemo: row.is_demo,
  };
}
