// Импорт мест из «Работа России» (Тимур, #29). Реальные вакансии, не тестовые: source = 'trudvsem', is_demo = false,
// ссылка на оригинал в source_url. Контакты работодателя не храним — студент откликается по ссылке на оригинал.
// Если API недоступен или не ответил вовремя, берём сохранённый снимок: сценарий не ломается.
// Уведомления бота на импортированные места не рассылаем (событие internship.created не публикуем): иначе спам.
import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import { fetchPilotVacancies, mapVacancy, type FetchOptions, type ImportedPlace, type TrudvsemVacancy } from './trudvsem.js';
import { TRUDVSEM_SNAPSHOT } from './trudvsemSnapshot.js';

export interface ImportResult {
  /** Откуда вакансии: живой API или сохранённый снимок. */
  from: 'api' | 'snapshot';
  vacancies: number;
  imported: number;
  skipped: number;
  closed: number;
}

type Query = (sql: string, params?: unknown[]) => Promise<unknown>;

async function upsert(db: { query: Query }, p: ImportedPlace): Promise<void> {
  await db.query(
    `INSERT INTO internships (company_name, title, description, required_skills, nice_skills, format, city, slots,
                              source, source_id, source_url, is_demo, status)
     VALUES ($1, $2, $3, $4, '{}', $5, $6, $7, 'trudvsem', $8, $9, false, 'open')
     ON CONFLICT (source, source_id) DO UPDATE SET
       company_name = EXCLUDED.company_name, title = EXCLUDED.title, description = EXCLUDED.description,
       required_skills = EXCLUDED.required_skills, format = EXCLUDED.format, city = EXCLUDED.city,
       slots = EXCLUDED.slots, source_url = EXCLUDED.source_url, status = 'open', updated_at = now()`,
    [p.companyName, p.title, p.description, p.requiredSkills, p.format, p.city, p.slots, p.sourceId, p.sourceUrl],
  );
}

export async function importTrudvsem(
  db: { query: Query },
  opts: FetchOptions & { log?: Logger; snapshot?: readonly TrudvsemVacancy[] } = {},
): Promise<ImportResult> {
  let from: ImportResult['from'] = 'api';
  let vacancies: readonly TrudvsemVacancy[];
  let complete = true;
  const live = await fetchPilotVacancies(opts);
  if (live.failed < live.total) {
    vacancies = live.vacancies;
    complete = live.failed === 0;
    if (!complete) opts.log?.warn({ failed: live.failed, total: live.total }, '«Работа России»: часть запросов не ответила');
  } else {
    from = 'snapshot';
    vacancies = opts.snapshot ?? TRUDVSEM_SNAPSHOT.vacancies;
    opts.log?.warn('«Работа России» недоступна — берём снимок');
  }

  const places = vacancies.map(mapVacancy).filter((p): p is ImportedPlace => p !== null);
  for (const p of places) await upsert(db, p);

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
