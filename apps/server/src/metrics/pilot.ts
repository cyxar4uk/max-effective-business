// Метрики пилота по данным сервиса (docs/03_product.md, «Метрики эффекта»). Тимур, #65, #125.
// Только настоящие записи (is_demo = false) и только агрегаты: ни имён, ни телефонов, ни id пользователей в выводе нет.
// Честно (#125): без самоотзывов и аккаунтов команды, «подходящий» — как в продукте, у каждой доли — свой знаменатель.

export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/** Период [from, to): границы — полночь по Москве. null — без границы. */
export interface Period {
  from: Date | null;
  to: Date | null;
}

/** Порог «подходящего» отклика по умолчанию — как порог уведомления бота (MATCH_NOTIFY_THRESHOLD). */
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

/** `METRICS_EXCLUDE_MAX_IDS=123,456` → [123, 456]; мусор отбрасываем. */
export function parseExcludeIds(raw: string | undefined): number[] {
  return (raw ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((v) => Number(v))
    .filter((v) => Number.isSafeInteger(v) && v !== 0);
}

export interface PilotMetrics {
  /** Места, опубликованные работодателями через сервис (без тестовых, «Работа России» и аккаунтов команды). */
  places: number;
  /**
   * Главная метрика: первый подходящий отклик (процент от порога и все обязательные навыки) не позже 2 рабочих дней.
   * eligible — места, у которых 2 рабочих дня уже прошли к концу периода: доля честная только по ним, иначе свежие
   * места без откликов (ещё не успевшие получить) занижали бы её, а места только с откликом — завышали.
   */
  firstMatch: {
    eligible: number;
    withinTarget: number;
    /** Места с хотя бы одним подходящим откликом (среди всех places) и медиана часов до первого. */
    withResponse: number;
    medianHours: number | null;
  };
  /** «Интересно» за период по всем местам и сколько из них с совпадением ≥ MATCH_STRONG. */
  interests: { total: number; strong: number };
  /**
   * Решения работодателей сервиса по «Интересно» за период (время решения — updated_at). olderThan24h — отклики,
   * которым к концу периода больше суток: «без решения» и «решено за сутки» честно считать только по ним.
   */
  decisions: {
    invited: number;
    declined: number;
    olderThan24h: number;
    pendingOver24h: number;
    decidedWithin24h: number;
    medianHours: number | null;
  };
  /** Воронка студентов: анкета → первое «Интересно». */
  funnel: { profiles: number; interested: number };
  /** Приглашения работодателей сервиса — по времени последнего изменения отклика. */
  invitations: number;
  /** Кого приглашают в зависимости от процента (#72), только места работодателей сервиса. */
  bands: { band: Band; interested: number; invited: number }[];
}

export const BANDS = ['80+', '70–79', '60–69', '<60'] as const;
export type Band = (typeof BANDS)[number];

export interface MetricsOptions {
  /** Порог «подходящего» отклика — как MATCH_NOTIFY_THRESHOLD. */
  threshold?: number;
  /** max_user_id аккаунтов команды и проверок: их места, отклики и анкеты не считаются (METRICS_EXCLUDE_MAX_IDS). */
  excludeMaxIds?: readonly number[];
  /** «Сейчас» — для тестов; конец периода не позже него. */
  now?: Date;
}

const toNumber = (v: unknown) => Number(v ?? 0);
const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

/** SQL с именованными параметрами `:name` → `$n` в порядке первого появления: pg не принимает неиспользуемые. */
export function bind(sql: string, values: Record<string, unknown>): [string, unknown[]] {
  const order: string[] = [];
  const text = sql.replace(/(?<!:):([a-z]+)\b/g, (m, name: string) => {
    if (!(name in values)) return m;
    if (!order.includes(name)) order.push(name);
    return `$${order.indexOf(name) + 1}`;
  });
  return [text, order.map((n) => values[n])];
}

// Аккаунты команды и проверок
const EXCLUDED = `(SELECT id FROM users WHERE max_user_id = ANY(:excl::bigint[]))`;
// Отклики без тестовых, без аккаунтов команды и без самоотзывов (владелец откликнулся на своё место — так проверяют
// сценарий одним аккаунтом). Настоящий студент на демо-месте тоже не в счёт: демо-компания приглашает сама через 20 с
const REAL_INTERESTS = `(SELECT x.*, s.source AS place_source FROM interests x
  JOIN internships s ON s.id = x.internship_id
  LEFT JOIN employers e ON e.id = s.employer_id
  WHERE NOT x.is_demo AND NOT s.is_demo AND x.interested_at IS NOT NULL
    AND x.student_user_id NOT IN ${EXCLUDED}
    AND (e.owner_user_id IS NULL OR (x.student_user_id <> e.owner_user_id AND e.owner_user_id NOT IN ${EXCLUDED})))`;
// Только места работодателей сервиса: на места «Работа России» решения в сервисе никто не принимает
const EMPLOYER_INTERESTS = `(SELECT * FROM ${REAL_INTERESTS} r WHERE r.place_source = 'employer')`;
// «Подходящий» — как в продукте: процент от порога и все обязательные навыки (бот уведомляет только таких)
const SUITABLE = `x.match_score >= :thr AND coalesce(jsonb_array_length(x.match -> 'mustMissing'), 0) = 0`;
const inPeriod = (column: string) => `(:from::timestamptz IS NULL OR ${column} >= :from) AND (:to::timestamptz IS NULL OR ${column} < :to)`;

export async function collectPilotMetrics(db: Queryable, period: Period, opts: MetricsOptions = {}): Promise<PilotMetrics> {
  const now = opts.now ?? new Date();
  const end = period.to && period.to < now ? period.to : now;
  const values = {
    from: period.from,
    to: period.to,
    excl: [...(opts.excludeMaxIds ?? [])],
    thr: opts.threshold ?? MATCH_OK,
    dayago: new Date(end.getTime() - 24 * 3600_000),
  };
  const q = async <T>(sql: string) => (await db.query(...bind(sql, values))) as T[];

  // Каждое место — время публикации и первого подходящего «Интересно»; сами места и студенты не выводятся
  const places = await q<{ published_at: Date; first_match_at: Date | null }>(
    `SELECT i.created_at AS published_at, min(x.interested_at) AS first_match_at
     FROM internships i
     JOIN employers e ON e.id = i.employer_id
     LEFT JOIN ${REAL_INTERESTS} x ON x.internship_id = i.id AND ${SUITABLE}
     WHERE NOT i.is_demo AND i.source = 'employer' AND e.owner_user_id NOT IN ${EXCLUDED} AND ${inPeriod('i.created_at')}
     GROUP BY i.id, i.created_at`,
  );
  const deadline = (p: { published_at: Date }) => addBusinessDays(new Date(p.published_at), TARGET_BUSINESS_DAYS).getTime();
  const eligible = places.filter((p) => deadline(p) <= end.getTime());
  const withinTarget = eligible.filter((p) => p.first_match_at !== null && new Date(p.first_match_at).getTime() <= deadline(p));
  const answered = places.filter((p) => p.first_match_at !== null);
  const hours = answered.map((p) => (new Date(p.first_match_at!).getTime() - new Date(p.published_at).getTime()) / 3_600_000);

  const [interests] = await q<{ total: unknown; strong: unknown }>(
    `SELECT count(*) AS total, count(*) FILTER (WHERE x.match_score >= ${MATCH_STRONG}) AS strong
     FROM ${REAL_INTERESTS} x WHERE ${inPeriod('x.interested_at')}`,
  );

  const [decisions] = await q<Record<'invited' | 'declined' | 'older' | 'pending' | 'fast', unknown>>(
    `SELECT count(*) FILTER (WHERE x.status = 'invited') AS invited,
            count(*) FILTER (WHERE x.status = 'declined') AS declined,
            count(*) FILTER (WHERE x.interested_at <= :dayago) AS older,
            count(*) FILTER (WHERE x.interested_at <= :dayago AND x.status = 'interested') AS pending,
            count(*) FILTER (WHERE x.interested_at <= :dayago AND x.status IN ('invited', 'declined')
                             AND x.updated_at - x.interested_at <= interval '24 hours') AS fast
     FROM ${EMPLOYER_INTERESTS} x WHERE ${inPeriod('x.interested_at')}`,
  );
  const responses = await q<{ hours: unknown }>(
    `SELECT extract(epoch FROM (x.updated_at - x.interested_at)) / 3600 AS hours
     FROM ${EMPLOYER_INTERESTS} x WHERE x.status IN ('invited', 'declined') AND ${inPeriod('x.interested_at')}`,
  );

  const [funnel] = await q<{ profiles: unknown; interested: unknown }>(
    `SELECT count(*) AS profiles,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${REAL_INTERESTS} x WHERE x.student_user_id = p.user_id)) AS interested
     FROM student_profiles p
     WHERE NOT p.is_demo AND p.user_id NOT IN ${EXCLUDED} AND ${inPeriod('p.created_at')}`,
  );

  const [invitations] = await q<{ n: unknown }>(
    `SELECT count(*) AS n FROM ${EMPLOYER_INTERESTS} x WHERE x.status = 'invited' AND ${inPeriod('x.updated_at')}`,
  );

  const bandRows = await q<{ band: Band; interested: unknown; invited: unknown }>(
    `SELECT CASE WHEN x.match_score >= 80 THEN '80+' WHEN x.match_score >= 70 THEN '70–79'
                 WHEN x.match_score >= 60 THEN '60–69' ELSE '<60' END AS band,
            count(*) AS interested, count(*) FILTER (WHERE x.status = 'invited') AS invited
     FROM ${EMPLOYER_INTERESTS} x WHERE ${inPeriod('x.interested_at')}
     GROUP BY 1`,
  );

  return {
    places: places.length,
    firstMatch: {
      eligible: eligible.length,
      withinTarget: withinTarget.length,
      withResponse: answered.length,
      medianHours: round1(median(hours)),
    },
    interests: { total: toNumber(interests?.total), strong: toNumber(interests?.strong) },
    decisions: {
      invited: toNumber(decisions?.invited),
      declined: toNumber(decisions?.declined),
      olderThan24h: toNumber(decisions?.older),
      pendingOver24h: toNumber(decisions?.pending),
      decidedWithin24h: toNumber(decisions?.fast),
      medianHours: round1(median(responses.map((r) => Math.max(0, Number(r.hours))))),
    },
    funnel: { profiles: toNumber(funnel?.profiles), interested: toNumber(funnel?.interested) },
    invitations: toNumber(invitations?.n),
    bands: BANDS.map((band) => {
      const row = bandRows.find((r) => r.band === band);
      return { band, interested: toNumber(row?.interested), invited: toNumber(row?.invited) };
    }),
  };
}

const pct = (part: number, whole: number) => (whole === 0 ? '—' : `${Math.round((part / whole) * 100)} %`);
const share = (part: number, whole: number) => `${part} из ${whole} (${pct(part, whole)})`;
const hoursText = (h: number | null, n: number) => (h === null ? '—' : `${h} ч (n = ${n})`);
const day = (d: Date) => new Date(d.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);

/** Таблица для терминала: метрика и значение; у долей — числитель и знаменатель, у медиан — n. */
export function formatPilotMetrics(m: PilotMetrics, period: Period, opts: Pick<MetricsOptions, 'threshold'> = {}): string {
  const from = period.from ? day(period.from) : 'начала';
  const to = period.to ? day(new Date(period.to.getTime() - 1)) : 'сегодня';
  const thr = opts.threshold ?? MATCH_OK;
  const d = m.decisions;
  const rows: [string, string][] = [
    ['Мест опубликовано работодателями', String(m.places)],
    [
      `Подходящий отклик не дольше ${TARGET_BUSINESS_DAYS} рабочих дней`,
      `${share(m.firstMatch.withinTarget, m.firstMatch.eligible)} — из мест, у которых срок уже прошёл`,
    ],
    [`Мест с подходящим откликом (≥ ${thr} % и все обязательные)`, share(m.firstMatch.withResponse, m.places)],
    ['Публикация → первый подходящий отклик, медиана', hoursText(m.firstMatch.medianHours, m.firstMatch.withResponse)],
    [`«Интересно» с совпадением ≥ ${MATCH_STRONG} %`, share(m.interests.strong, m.interests.total)],
    ['Работодатель пригласил — из принятых решений', share(d.invited, d.invited + d.declined)],
    ['Отклики старше суток без решения', share(d.pendingOver24h, d.olderThan24h)],
    ['Отклики старше суток, решённые за сутки', share(d.decidedWithin24h, d.olderThan24h)],
    ['Ответ работодателя на отклик, медиана', hoursText(d.medianHours, d.invited + d.declined)],
    ['Студенты: анкета → первое «Интересно»', share(m.funnel.interested, m.funnel.profiles)],
    ['Приглашений', String(m.invitations)],
    ...m.bands.map(({ band, interested, invited }): [string, string] => [`  приглашены при совпадении ${band} %`, share(invited, interested)]),
  ];
  const width = Math.max(...rows.map(([k]) => k.length));
  return [
    `Метрики пилота «Тандем» с ${from} по ${to} (без тестовых данных, самоотзывов и аккаунтов команды)`,
    '',
    ...rows.map(([k, v]) => `${k.padEnd(width)}  ${v}`),
  ].join('\n');
}
