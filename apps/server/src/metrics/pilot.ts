// Метрики пилота по данным сервиса (docs/03_product.md, «Метрики эффекта»). Тимур, #65.
// Только настоящие записи (is_demo = false) и только агрегаты: ни имён, ни телефонов, ни id пользователей в выводе нет.

export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/** Период [from, to): границы — полночь по Москве. null — без границы. */
export interface Period {
  from: Date | null;
  to: Date | null;
}

/** Совпадение, с которого отклик считается подходящим: порог уведомления в боте. */
export const MATCH_OK = 60;
/** Совпадение, с которого отклик считается сильным (вспомогательная метрика). */
export const MATCH_STRONG = 70;
/** Цель пилота: первый подходящий отклик не позже чем через 2 рабочих дня после публикации. */
export const TARGET_BUSINESS_DAYS = 2;

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Момент через `days` рабочих дней: каждый шаг — сутки, суббота и воскресенье по Москве не считаются.
 * Праздники не учитываем — для пилота на несколько недель это допустимое упрощение.
 */
export function addBusinessDays(start: Date, days: number): Date {
  let t = start.getTime();
  let left = days;
  while (left > 0) {
    t += 24 * 60 * 60 * 1000;
    const weekday = new Date(t + MSK_OFFSET_MS).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left--;
  }
  return new Date(t);
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** «2026-10-01» → полночь этого дня по Москве. */
export function mskDate(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Дата в формате ГГГГ-ММ-ДД: ${day}`);
  const d = new Date(`${day}T00:00:00+03:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`Нет такой даты: ${day}`);
  return d;
}

/** `--from 2026-10-01 --to 2026-12-31`: обе даты включительно, любую можно опустить. */
export function parsePeriod(args: readonly string[]): Period {
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const from = value('--from');
  const to = value('--to');
  return {
    from: from ? mskDate(from) : null,
    to: to ? new Date(mskDate(to).getTime() + 24 * 60 * 60 * 1000) : null,
  };
}

export interface PilotMetrics {
  /** Места, опубликованные работодателями через сервис (без тестовых и импорта из «Работа России»). */
  places: number;
  /** Главная метрика: публикация → первое «Интересно» с совпадением ≥ MATCH_OK. */
  firstMatch: {
    withResponse: number;
    medianHours: number | null;
    withinTarget: number;
  };
  /** Доля «Интересно» с совпадением ≥ MATCH_STRONG. */
  interests: { total: number; strong: number };
  /** Воронка студентов: анкета → первое «Интересно». */
  funnel: { profiles: number; interested: number };
  /** Приглашения — по времени последнего изменения отклика: отдельного времени приглашения в базе нет. */
  invitations: number;
  /**
   * Кого приглашают в зависимости от процента (#72): «Интересно» за период по полосам совпадения и сколько из них
   * уже приглашены. По нему подбираются порог уведомления и веса 70/30 после пилота.
   */
  bands: { band: Band; interested: number; invited: number }[];
}

export const BANDS = ['80+', '70–79', '60–69', '<60'] as const;
export type Band = (typeof BANDS)[number];

// Условие периода для столбца: $1 — начало, $2 — конец (не включительно); null — без границы
const inPeriod = (column: string) => `($1::timestamptz IS NULL OR ${column} >= $1) AND ($2::timestamptz IS NULL OR ${column} < $2)`;

const toNumber = (v: unknown) => Number(v ?? 0);

export async function collectPilotMetrics(db: Queryable, period: Period): Promise<PilotMetrics> {
  const params = [period.from, period.to];

  // Для каждого места — время публикации и первого подходящего «Интересно»; сами места и студенты не выводятся
  const places = (await db.query(
    `SELECT i.created_at AS published_at, min(x.interested_at) AS first_match_at
     FROM internships i
     LEFT JOIN interests x ON x.internship_id = i.id AND NOT x.is_demo
                          AND x.interested_at IS NOT NULL AND x.match_score >= ${MATCH_OK}
     WHERE NOT i.is_demo AND i.source = 'employer' AND ${inPeriod('i.created_at')}
     GROUP BY i.id, i.created_at`,
    params,
  )) as { published_at: Date; first_match_at: Date | null }[];

  const answered = places.filter((p) => p.first_match_at !== null);
  const hours = answered.map((p) => (new Date(p.first_match_at!).getTime() - new Date(p.published_at).getTime()) / 3_600_000);
  const withinTarget = answered.filter(
    (p) => new Date(p.first_match_at!).getTime() <= addBusinessDays(new Date(p.published_at), TARGET_BUSINESS_DAYS).getTime(),
  ).length;

  const [interests] = (await db.query(
    `SELECT count(*) AS total, count(*) FILTER (WHERE match_score >= ${MATCH_STRONG}) AS strong
     FROM interests
     WHERE NOT is_demo AND interested_at IS NOT NULL AND ${inPeriod('interested_at')}`,
    params,
  )) as { total: unknown; strong: unknown }[];

  const [funnel] = (await db.query(
    `SELECT count(*) AS profiles,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM interests x
              WHERE x.student_user_id = p.user_id AND NOT x.is_demo AND x.interested_at IS NOT NULL
            )) AS interested
     FROM student_profiles p
     WHERE NOT p.is_demo AND ${inPeriod('p.created_at')}`,
    params,
  )) as { profiles: unknown; interested: unknown }[];

  const [invitations] = (await db.query(
    `SELECT count(*) AS n FROM interests WHERE NOT is_demo AND status = 'invited' AND ${inPeriod('updated_at')}`,
    params,
  )) as { n: unknown }[];

  const bandRows = (await db.query(
    `SELECT CASE WHEN match_score >= 80 THEN '80+' WHEN match_score >= 70 THEN '70–79'
                 WHEN match_score >= ${MATCH_OK} THEN '60–69' ELSE '<60' END AS band,
            count(*) AS interested, count(*) FILTER (WHERE status = 'invited') AS invited
     FROM interests
     WHERE NOT is_demo AND interested_at IS NOT NULL AND ${inPeriod('interested_at')}
     GROUP BY 1`,
    params,
  )) as { band: Band; interested: unknown; invited: unknown }[];
  const bands = BANDS.map((band) => {
    const row = bandRows.find((r) => r.band === band);
    return { band, interested: toNumber(row?.interested), invited: toNumber(row?.invited) };
  });

  const medianHours = median(hours);
  return {
    places: places.length,
    firstMatch: {
      withResponse: answered.length,
      medianHours: medianHours === null ? null : Math.round(medianHours * 10) / 10,
      withinTarget,
    },
    interests: { total: toNumber(interests?.total), strong: toNumber(interests?.strong) },
    funnel: { profiles: toNumber(funnel?.profiles), interested: toNumber(funnel?.interested) },
    invitations: toNumber(invitations?.n),
    bands,
  };
}

const pct = (part: number, whole: number) => (whole === 0 ? '—' : `${Math.round((part / whole) * 100)} %`);
const day = (d: Date) => new Date(d.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);

/** Таблица для терминала: метрика и значение. */
export function formatPilotMetrics(m: PilotMetrics, period: Period): string {
  const from = period.from ? day(period.from) : 'начала';
  const to = period.to ? day(new Date(period.to.getTime() - 1)) : 'сегодня';
  const rows: [string, string][] = [
    ['Мест опубликовано работодателями', String(m.places)],
    [`Мест с подходящим откликом (≥ ${MATCH_OK} %)`, `${m.firstMatch.withResponse} (${pct(m.firstMatch.withResponse, m.places)})`],
    ['Публикация → первый подходящий отклик, медиана', m.firstMatch.medianHours === null ? '—' : `${m.firstMatch.medianHours} ч`],
    [`  из них не дольше ${TARGET_BUSINESS_DAYS} рабочих дней`, `${m.firstMatch.withinTarget} (${pct(m.firstMatch.withinTarget, m.firstMatch.withResponse)})`],
    [`«Интересно» с совпадением ≥ ${MATCH_STRONG} %`, `${m.interests.strong} из ${m.interests.total} (${pct(m.interests.strong, m.interests.total)})`],
    ['Студенты: анкета → первое «Интересно»', `${m.funnel.interested} из ${m.funnel.profiles} (${pct(m.funnel.interested, m.funnel.profiles)})`],
    ['Приглашений', String(m.invitations)],
    ...m.bands.map(({ band, interested, invited }): [string, string] => [
      `  приглашены при совпадении ${band} %`,
      `${invited} из ${interested} (${pct(invited, interested)})`,
    ]),
  ];
  const width = Math.max(...rows.map(([k]) => k.length));
  return [
    `Метрики пилота «Тандем» с ${from} по ${to} (без тестовых данных)`,
    '',
    ...rows.map(([k, v]) => `${k.padEnd(width)}  ${v}`),
  ].join('\n');
}
