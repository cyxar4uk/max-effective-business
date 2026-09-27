// Открытый API вакансий «Работа России» (opendata.trudvsem.ru). Сверено по живому ответу 28.09.2026:
//   GET http://opendata.trudvsem.ru/api/v1/vacancies/region/<код региона>?text=…&offset=…&limit=… (limit ≤ 100)
//   → { status, meta: { total, limit }, results: { vacancies: [{ vacancy: {…} }] } }
// API отвечает медленно (≈ 15 с на страницу), поэтому импорт идёт фоном, с таймаутом и сохранённым снимком.
// Страницу из 100 вакансий Node не дожидался и за 90 с (curl получал за 12 с), страница из 50 — 14 с: берём 50.
import { mapSkills } from './skillMap.js';

export const TRUDVSEM_API = 'http://opendata.trudvsem.ru/api/v1';

/** Регионы пилота: Москва (РАНХиГС) и Татарстан (финал в Казани). Коды — из ответа API (region.region_code). */
export const PILOT_REGIONS = [
  { code: '7700000000000', city: 'Москва' },
  { code: '1600000000000', city: 'Казань' },
] as const;

/** Что ищем: места для студентов без опыта. */
export const QUERIES = ['стажер', 'практикант'];

/** Поля вакансии, которые мы берём. Контакты (телефоны, почта, контактное лицо) не берём и не храним. */
export interface TrudvsemVacancy {
  id: string;
  'job-name': string;
  company?: { name?: string };
  region?: { region_code?: string; name?: string };
  addresses?: { address?: { location?: string }[] };
  schedule?: string;
  duty?: string;
  requirements?: string;
  skills?: string[];
  salary_min?: number;
  salary_max?: number;
  work_places?: number;
  vac_url?: string;
  requirement?: { experience?: number };
  'creation-date'?: string;
}

/** Место в нашем формате, готовое к записи в internships. */
export interface ImportedPlace {
  sourceId: string;
  sourceUrl: string | null;
  title: string;
  companyName: string;
  description: string;
  requiredSkills: string[];
  format: 'office' | 'remote';
  city: string | null;
  slots: number;
}

/** Копия только нужных полей: в снимок и в лог не попадают контакты отдела кадров. */
export function pickFields(v: TrudvsemVacancy): TrudvsemVacancy {
  return {
    id: v.id,
    'job-name': v['job-name'],
    company: { name: v.company?.name },
    region: { region_code: v.region?.region_code, name: v.region?.name },
    addresses: { address: (v.addresses?.address ?? []).slice(0, 1).map((a) => ({ location: a.location })) },
    schedule: v.schedule,
    duty: v.duty,
    requirements: v.requirements,
    skills: v.skills,
    salary_min: v.salary_min,
    salary_max: v.salary_max,
    work_places: v.work_places,
    vac_url: v.vac_url,
    requirement: { experience: v.requirement?.experience },
    'creation-date': v['creation-date'],
  };
}

/** Город: из адреса («г Казань, …»), иначе по региону пилота, иначе название региона без «Город». */
export function cityOf(v: TrudvsemVacancy): string | null {
  const location = v.addresses?.address?.[0]?.location ?? '';
  const m = /(?:^|,\s*)г\.?\s+([А-ЯЁ][А-ЯЁа-яё-]*(?:\s[А-ЯЁ][а-яё-]+)?)/.exec(location);
  if (m) return m[1]!;
  const pilot = PILOT_REGIONS.find((r) => r.code === v.region?.region_code);
  if (pilot) return pilot.city;
  return v.region?.name?.replace(/^Город\s+/, '') ?? null;
}

export const formatOf = (v: TrudvsemVacancy): 'office' | 'remote' => (/удал[её]н/i.test(v.schedule ?? '') ? 'remote' : 'office');

const MAX_REQUIRED = 5;
/** Описание короткое: карточке хватает задач и требований, полный текст — по ссылке на оригинал. */
const MAX_DESCRIPTION = 1500;

/**
 * Вакансия → место. null — не берём: нужен опыт, в названии нет признака студенческого места, или ни один навык
 * не сопоставился со справочником
 * (без навыков расчёт совпадения дал бы 100 % всем студентам).
 */
/** Место для студента, а не просто вакансия, где «стажёр» мелькнул в тексте (например, «риелтор с обучением»). */
export const STUDENT_TITLE = /стаж[её]р|стажир|практикант|практик[аи]|младш|помощник|ассистент|начинающ|студент|без опыта/i;

export function mapVacancy(v: TrudvsemVacancy): ImportedPlace | null {
  if ((v.requirement?.experience ?? 0) > 1) return null;
  if (!STUDENT_TITLE.test(v['job-name'] ?? '')) return null;
  // Поле skills у большинства вакансий пустое — навыки ищем ещё в названии, требованиях и обязанностях
  const skills = mapSkills([v['job-name'] ?? '', ...(v.skills ?? []), v.requirements ?? '', v.duty ?? '']).slice(0, MAX_REQUIRED);
  if (!skills.length || !v.id || !v['job-name']) return null;

  const format = formatOf(v);
  const salary = v.salary_min ? `Зарплата: от ${v.salary_min} ₽.` : '';
  const description = [v.duty, v.requirements ? `Требования: ${v.requirements}` : '', salary, 'Источник — «Работа России».']
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join('\n\n');

  return {
    sourceId: v.id,
    sourceUrl: v.vac_url ?? null,
    title: v['job-name'].trim().slice(0, 200),
    companyName: (v.company?.name ?? 'Работодатель с «Работа России»').trim().slice(0, 200),
    description: description.length > MAX_DESCRIPTION ? `${description.slice(0, MAX_DESCRIPTION - 1)}…` : description,
    requiredSkills: skills,
    format,
    // Для удалённых город не нужен; для очных — обязателен (ограничение таблицы internships)
    city: format === 'remote' ? null : cityOf(v),
    slots: Math.min(Math.max(v.work_places ?? 1, 1), 100),
  };
}

/** Вакансий на запрос. На пилот хватает: по Москве на «стажер» около 60, после отбора по навыкам — меньше. */
export const PAGE_LIMIT = 50;

export interface FetchOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  limit?: number;
}

/** Одна страница вакансий по региону и запросу. Бросает ошибку при таймауте, сети или не-200. */
export async function fetchVacancies(regionCode: string, text: string, opts: FetchOptions = {}): Promise<TrudvsemVacancy[]> {
  const url = `${TRUDVSEM_API}/vacancies/region/${regionCode}?text=${encodeURIComponent(text)}&offset=0&limit=${opts.limit ?? PAGE_LIMIT}`;
  const res = await (opts.fetch ?? fetch)(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000) });
  if (!res.ok) throw new Error(`«Работа России»: HTTP ${res.status}`);
  const body = (await res.json()) as { results?: { vacancies?: { vacancy: TrudvsemVacancy }[] } };
  return (body.results?.vacancies ?? []).map((x) => x.vacancy);
}

/**
 * Все регионы и запросы пилота; дубли по id убираем. API нестабилен: отдельный запрос может не ответить,
 * поэтому сбой одного запроса не отменяет остальные — считаем, сколько не удалось.
 */
export async function fetchPilotVacancies(opts: FetchOptions = {}): Promise<{ vacancies: TrudvsemVacancy[]; failed: number; total: number }> {
  const byId = new Map<string, TrudvsemVacancy>();
  let failed = 0;
  let total = 0;
  for (const region of PILOT_REGIONS) {
    for (const q of QUERIES) {
      total++;
      try {
        for (const v of await fetchVacancies(region.code, q, opts)) byId.set(v.id, pickFields(v));
      } catch {
        failed++;
      }
    }
  }
  return { vacancies: [...byId.values()], failed, total };
}
