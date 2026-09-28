// Импорт мест из «Работа России» (Тимур, #29). Реальные вакансии, не тестовые: source = 'trudvsem', is_demo = false,
// ссылка на оригинал в source_url. Контакты работодателя не храним — студент откликается по ссылке на оригинал.
// Если API не ответил совсем и мест из «Работа России» в базе ещё нет, берём сохранённый снимок: сценарий не ломается.
// Если база уже заполнена, снимок не трогает её: он не должен открывать закрытое и затирать свежее старым.
// Уведомления бота на импортированные места не рассылаем (событие internship.created не публикуем): иначе спам.
import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import { fetchPilotVacancies, mapVacancy, type FetchOptions, type ImportedPlace, type TrudvsemVacancy } from './trudvsem.js';
import { TRUDVSEM_SNAPSHOT } from './trudvsemSnapshot.js';

export interface ImportResult {
  /** Откуда вакансии: живой API, сохранённый снимок (база была пуста) или ниоткуда (API молчит, база уже заполнена). */
  from: 'api' | 'snapshot' | 'none';
  vacancies: number;
  imported: number;
  skipped: number;
  closed: number;
}

type Query = (sql: string, params?: unknown[]) => Promise<unknown>;

/** Живые данные обновляют и снова открывают место; снимок только добавляет новые, существующие не трогает. */
async function upsert(db: { query: Query }, p: ImportedPlace, fromSnapshot: boolean): Promise<void> {
  await db.query(
    `INSERT INTO internships (company_name, title, description, required_skills, nice_skills, format, city, slots,
                              source, source_id, source_url, is_demo, status)
     VALUES ($1, $2, $3, $4, '{}', $5, $6, $7, 'trudvsem', $8, $9, false, 'open')
     ON CONFLICT (source, source_id) ${
       fromSnapshot
         ? 'DO NOTHING'
         : `DO UPDATE SET
       company_name = EXCLUDED.company_name, title = EXCLUDED.title, description = EXCLUDED.description,
       required_skills = EXCLUDED.required_skills, format = EXCLUDED.format, city = EXCLUDED.city,
       slots = EXCLUDED.slots, source_url = EXCLUDED.source_url, status = 'open', updated_at = now()`
     }`,
    [p.companyName, p.title, p.description, p.requiredSkills, p.format, p.city, p.slots, p.sourceId, p.sourceUrl],
  );
}

export async function importTrudvsem(
  db: { query: Query },
  opts: FetchOptions & { log?: Logger; snapshot?: readonly TrudvsemVacancy[] } = {},
): Promise<ImportResult> {
  const live = await fetchPilotVacancies(opts);
  if (live.errors.length) opts.log?.warn({ errors: live.errors, total: live.total }, '«Работа России»: не все запросы получены целиком');

  let from: ImportResult['from'] = 'api';
  let vacancies: readonly TrudvsemVacancy[] = live.vacancies;
  const complete = live.failed === 0;
  if (live.failed === live.total && !live.vacancies.length) {
    // API не ответил совсем. Снимок только заполняет пустую базу: иначе он снова открыл бы вакансии,
    // которые живой импорт уже закрыл, и затёр бы свежие данные старыми.
    const [row] = (await db.query(`SELECT count(*)::int AS n FROM internships WHERE source = 'trudvsem'`)) as { n: number }[];
    if ((row?.n ?? 0) > 0) {
      return { from: 'none', vacancies: 0, imported: 0, skipped: 0, closed: 0 };
    }
    from = 'snapshot';
    vacancies = opts.snapshot ?? TRUDVSEM_SNAPSHOT.vacancies;
  }

  const places = vacancies.map(mapVacancy).filter((p): p is ImportedPlace => p !== null);
  for (const p of places) await upsert(db, p, from === 'snapshot');

  // Пропавшие с сайта вакансии закрываем только по полному живому ответу: по снимку или неполному ответу не видно,
  // что вакансию сняли с публикации
  let closed = 0;
  if (from === 'api' && complete) {
    const rows = (await db.query(
      `UPDATE internships SET status = 'closed', updated_at = now()
       WHERE source = 'trudvsem' AND status = 'open' AND NOT (source_id = ANY($1)) RETURNING id`,
      [places.map((p) => p.sourceId)],
    )) as unknown[] | [unknown[], number];
    // UPDATE … RETURNING в TypeORM приходит как [строки, число]
    closed = Array.isArray(rows[0]) ? (rows[0] as unknown[]).length : rows.length;
  }

  return { from, vacancies: vacancies.length, imported: places.length, skipped: vacancies.length - places.length, closed };
}

/** Раз в 6 часов: чаще незачем, API медленный. */
export const IMPORT_INTERVAL_MS = 6 * 3600_000;

/** Фоновый импорт: сразу после старта (не задерживая его) и дальше по расписанию. Ошибка — в лог, сервер работает. */
export function registerTrudvsemImport(deps: { ds: DataSource; log: Logger; intervalMs?: number }): { stop(): void } {
  const run = () =>
    importTrudvsem(deps.ds, { log: deps.log })
      .then((r) => deps.log.info(r, 'Импорт из «Работа России»'))
      .catch((err: unknown) => deps.log.error({ err }, 'Импорт из «Работа России» не удался'));
  void run();
  const timer = setInterval(() => void run(), deps.intervalMs ?? IMPORT_INTERVAL_MS);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
