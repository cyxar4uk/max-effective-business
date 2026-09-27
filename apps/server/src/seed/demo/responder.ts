// Демо-отклики на стажировку проверяющего. Только при SEED_DEMO=true.
//
// Зачем: проверяющий один, и в роли работодателя он публикует свою стажировку. Настоящих студентов в демо нет,
// а демо-студенты откликнулись только на демо-стажировки, поэтому список кандидатов был бы пустым и шаг
// «работодатель видит заинтересованных» не пройти. Здесь подходящие демо-студенты сразу откликаются на новую
// стажировку. Процент считает тот же matching, отклики помечены is_demo — в интерфейсе видно, что студенты тестовые.
import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import type { EventBus } from '../../events.js';
import { matchStudentToInternship, type InternshipMatchInput, type MatchResult, type StudentMatchInput } from '../../matching/index.js';

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
    const { score, mustMatched, mustMissing, niceMatched, niceMissing } = match;
    const rows: unknown[] = await ds.query(
      `INSERT INTO interests (student_user_id, internship_id, status, match_score, match, is_demo)
       VALUES ($1, $2, 'interested', $3, $4::jsonb, true)
       ON CONFLICT (student_user_id, internship_id) DO NOTHING
       RETURNING id`,
      [userId, internshipId, score, JSON.stringify({ score, mustMatched, mustMissing, niceMatched, niceMissing })],
    );
    created += rows.length;
  }
  return created;
}

/** Подписка на internship.created. Ошибка логируется шиной событий и не ломает запрос работодателя. */
export function registerDemoResponder(deps: { events: EventBus; ds: DataSource; log: Logger; threshold: number }): void {
  deps.events.on('internship.created', async ({ internshipId }) => {
    const created = await respondWithDemoStudents(deps.ds, internshipId, deps.threshold);
    if (created) deps.log.info({ internshipId, created }, 'Демо-студенты откликнулись на стажировку');
  });
}
