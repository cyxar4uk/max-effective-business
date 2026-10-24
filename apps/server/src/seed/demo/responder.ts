// Демо-отклики на стажировку проверяющего. Только при SEED_DEMO=true.
//
// Зачем: проверяющий один, и в роли работодателя он публикует свою стажировку. Настоящих студентов в демо нет,
// а демо-студенты откликнулись только на демо-стажировки, поэтому список кандидатов был бы пустым и шаг
// «работодатель видит заинтересованных» не пройти. Здесь подходящие демо-студенты сразу откликаются на новую
// стажировку. Процент считает тот же matching, отклики помечены is_demo — в интерфейсе видно, что студенты тестовые.
//
// Обратная сторона — путь студента. Демо-компании — не настоящие аккаунты, войти за них и пригласить нельзя,
// поэтому без помощи отклик проверяющего на демо-место повисает. Здесь демо-компания сама приглашает его
// через DEMO_INVITE_DELAY_MS, если совпадение не ниже DEMO_INVITE_SCORE: бот присылает приглашение с контактом,
// и в приложении открывается «Это тандем!».
import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import { DEFAULT_DEMO_INVITE_COOLDOWN_HOURS } from '../../config.js';
import type { AppEvents, EventBus } from '../../events.js';
import { matchBreakdown, matchStudentToInternship, type InternshipMatchInput, type MatchResult, type StudentMatchInput } from '../../matching/index.js';

/** Сколько демо-студентов откликается на стажировку проверяющего. */
export const DEMO_RESPONSES_LIMIT = 5;
/** Сколько мест оставляем студентам «с пробелами» (совпадение ниже STRONG_SCORE), чтобы была видна расшифровка. */
export const DEMO_PARTIAL_SLOTS = 2;
export const STRONG_SCORE = 80;

export interface DemoCandidate extends StudentMatchInput {
  userId: number;
}

/**
 * Демо-студенты для стажировки проверяющего: прошли фильтры, совпадение не ниже порога.
 * Берём до трёх сильных (от 80 %) и до двух с пробелами (от порога до 79 %): если откликнутся только
 * стопроцентные, не будет видно главного — что совпало и чего не хватает. Если одной группы мало, добираем другой.
 * Результат — по убыванию процента.
 */
export function pickDemoResponders(
  internship: InternshipMatchInput,
  students: readonly DemoCandidate[],
  threshold: number,
  limit: number = DEMO_RESPONSES_LIMIT,
): { userId: number; match: MatchResult }[] {
  const ranked = students
    .map((s, order) => ({ userId: s.userId, order, match: matchStudentToInternship(s, internship) }))
    .filter(({ match }) => match.passesFilters && match.score >= threshold)
    .sort((a, b) => b.match.score - a.match.score || a.order - b.order);

  const strong = ranked.filter((x) => x.match.score >= STRONG_SCORE);
  const partial = ranked.filter((x) => x.match.score < STRONG_SCORE);
  const partialCount = Math.min(partial.length, DEMO_PARTIAL_SLOTS, limit);
  const strongCount = Math.min(strong.length, limit - partialCount);
  const extraPartial = Math.min(partial.length - partialCount, limit - partialCount - strongCount);

  return [...strong.slice(0, strongCount), ...partial.slice(0, partialCount + extraPartial)]
    .sort((a, b) => b.match.score - a.match.score || a.order - b.order)
    .map(({ userId, match }) => ({ userId, match }));
}

/** Создаёт демо-отклики на стажировку. Демо-стажировки пропускает. Повторный вызов ничего не дублирует. Возвращает число новых откликов. */
export async function respondWithDemoStudents(ds: DataSource, internshipId: number, threshold: number): Promise<number> {
  const [internship]: {
    required_skills: string[];
    nice_skills: string[];
    format: InternshipMatchInput['format'];
    city: string | null;
    is_demo: boolean;
    status: string;
  }[] = await ds.query(
    `SELECT required_skills, nice_skills, format, city, is_demo, status FROM internships WHERE id = $1`,
    [internshipId],
  );
  if (!internship || internship.is_demo || internship.status !== 'open') return 0;

  const students: { user_id: number; skills: string[]; formats: StudentMatchInput['formats']; city: string }[] = await ds.query(
    `SELECT user_id, skills, formats, city FROM student_profiles WHERE is_demo ORDER BY user_id`,
  );
  const picked = pickDemoResponders(
    { requiredSkills: internship.required_skills, niceSkills: internship.nice_skills, format: internship.format, city: internship.city },
    students.map((s) => ({ userId: s.user_id, skills: s.skills, formats: s.formats, city: s.city })),
    threshold,
  );

  let created = 0;
  for (const { userId, match } of picked) {
    const rows: unknown[] = await ds.query(
      `INSERT INTO interests (student_user_id, internship_id, status, match_score, match, is_demo)
       VALUES ($1, $2, 'interested', $3, $4::jsonb, true)
       ON CONFLICT (student_user_id, internship_id) DO NOTHING
       RETURNING id`,
      [userId, internshipId, match.score, JSON.stringify(matchBreakdown(match))],
    );
    created += rows.length;
  }
  return created;
}

/** С какого совпадения демо-компания приглашает студента сама: ниже — отклик ждёт, как у живой компании. */
export const DEMO_INVITE_SCORE = 70;
/** Через сколько после отклика демо-компания приглашает: пауза, чтобы было видно «Отклик отправлен», потом приглашение. */
export const DEMO_INVITE_DELAY_MS = 20_000;
/**
 * Не чаще одного демо-приглашения студенту за столько часов (по умолчанию; на сервере — DEMO_INVITE_COOLDOWN_HOURS
 * из окружения, 0 — без ограничения). Для показа хватает одного «Это тандем!», а настоящий студент пилота
 * (SEED_DEMO на проде включён) не получит пачку приглашений от вымышленных компаний.
 */
export const DEMO_INVITE_COOLDOWN_HOURS = DEFAULT_DEMO_INVITE_COOLDOWN_HOURS;
/** После рестарта сервера таймеры потеряны: отклики не старше стольких минут приглашаем при старте. */
export const DEMO_INVITE_CATCH_UP_MIN = 10;

// Кого демо-компания приглашает: настоящий студент (не демо), открытое демо-место, отклик всё ещё «интересно»,
// совпадение от порога ($1) и других демо-приглашений у студента за $2 часов не было ($2 = 0 — без ограничения).
// Один UPDATE с условием на статус: если студент успел передумать, ничего не меняется.
const INVITE_SQL = `
  UPDATE interests i SET status = 'invited', updated_at = now()
  FROM internships s
  WHERE s.id = i.internship_id AND s.is_demo AND s.status = 'open'
    AND NOT i.is_demo AND i.status = 'interested' AND i.match_score >= $1
    AND ($2::int = 0 OR NOT EXISTS (
      SELECT 1 FROM interests o JOIN internships os ON os.id = o.internship_id
      WHERE o.student_user_id = i.student_user_id AND o.id <> i.id AND os.is_demo AND o.status = 'invited'
        AND o.updated_at > now() - make_interval(hours => $2::int)
    ))`;

/** Условия демо-приглашения; по умолчанию — DEMO_INVITE_SCORE и DEMO_INVITE_COOLDOWN_HOURS. */
export interface DemoInviteOptions {
  minScore?: number;
  /** Не чаще одного демо-приглашения студенту за столько часов; 0 — без ограничения. */
  cooldownHours?: number;
}

const inviteParams = (opts: DemoInviteOptions) => [opts.minScore ?? DEMO_INVITE_SCORE, opts.cooldownHours ?? DEMO_INVITE_COOLDOWN_HOURS];

/** Демо-компания приглашает откликнувшегося (условия — INVITE_SQL). Возвращает true, если пригласила. */
export async function inviteForDemoEmployer(ds: DataSource, interestId: number, opts: DemoInviteOptions = {}): Promise<boolean> {
  const [rows]: [unknown[], number] = await ds.query(`${INVITE_SQL} AND i.id = $3 RETURNING i.id`, [...inviteParams(opts), interestId]);
  return rows.length > 0;
}

/** Догоняющий проход после рестарта: те же условия для откликов не старше DEMO_INVITE_CATCH_UP_MIN минут. */
export async function inviteRecentForDemoEmployers(
  ds: DataSource,
  opts: DemoInviteOptions = {},
): Promise<AppEvents['interest.invited'][]> {
  const [rows]: [{ id: string; internship_id: string; student_user_id: string }[], number] = await ds.query(
    `${INVITE_SQL} AND i.interested_at > now() - make_interval(mins => ${DEMO_INVITE_CATCH_UP_MIN})
     RETURNING i.id, i.internship_id, i.student_user_id`,
    inviteParams(opts),
  );
  return rows.map((r) => ({ interestId: Number(r.id), internshipId: Number(r.internship_id), studentUserId: Number(r.student_user_id) }));
}

/**
 * Подписки демо-режима. Ошибка логируется шиной событий и не ломает запрос пользователя.
 * - internship.created — демо-студенты откликаются на место проверяющего, и бот пишет ему об этом один раз;
 * - interest.created — демо-компания через паузу приглашает проверяющего на своё место;
 * - при старте, через ту же паузу (бот уже подписан на события), — догоняющий проход за время рестарта.
 */
export function registerDemoResponder(deps: {
  events: EventBus;
  ds: DataSource;
  log: Logger;
  threshold: number;
  inviteDelayMs?: number;
  /** DEMO_INVITE_COOLDOWN_HOURS из окружения; не задано — DEMO_INVITE_COOLDOWN_HOURS по умолчанию. */
  inviteCooldownHours?: number;
}): void {
  const delay = deps.inviteDelayMs ?? DEMO_INVITE_DELAY_MS;
  const invite: DemoInviteOptions = { cooldownHours: deps.inviteCooldownHours };
  const later = (task: () => Promise<void>, what: string) => {
    // Таймер не держит процесс: при остановке сервера приглашение случится догоняющим проходом после старта
    setTimeout(() => void task().catch((err: unknown) => deps.log.error({ err }, what)), delay).unref();
  };

  deps.events.on('internship.created', async ({ internshipId }) => {
    const created = await respondWithDemoStudents(deps.ds, internshipId, deps.threshold);
    if (!created) return;
    deps.log.info({ internshipId, created }, 'Демо-студенты откликнулись на стажировку');
    deps.events.emit('demo.responses', { internshipId, count: created });
  });

  deps.events.on('interest.created', (e) => {
    if (e.status !== 'interested') return;
    later(async () => {
      if (!(await inviteForDemoEmployer(deps.ds, e.interestId, invite))) return;
      deps.log.info({ interestId: e.interestId, internshipId: e.internshipId }, 'Демо-компания пригласила студента');
      deps.events.emit('interest.invited', { interestId: e.interestId, internshipId: e.internshipId, studentUserId: e.studentUserId });
    }, 'Демо-компания не смогла пригласить студента');
  });

  later(async () => {
    const invited = await inviteRecentForDemoEmployers(deps.ds, invite);
    if (invited.length) deps.log.info({ invited: invited.length }, 'Демо-компании пригласили студентов после рестарта');
    for (const e of invited) deps.events.emit('interest.invited', e);
  }, 'Догоняющий проход демо-приглашений не удался');
}
