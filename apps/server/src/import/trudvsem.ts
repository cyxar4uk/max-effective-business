// Открытый API вакансий «Работа России» (opendata.trudvsem.ru). Сверено по живым ответам 28.09.2026:
//   GET https://opendata.trudvsem.ru/api/v1/vacancies/region/<код региона>?text=…&offset=<номер страницы>&limit=…
//   → { status, meta: { total, limit }, results: { vacancies: [{ vacancy: {…} }] } }
// offset — номер страницы, а не число пропущенных записей: offset=1&limit=50 отдаёт вакансии 51–100.
// API медленный и нестабильный: страница — 12–15 с, иногда ответ обрывается на середине. Поэтому импорт идёт
// фоном, с таймаутом на запрос и сохранённым снимком. Страницу из 100 Node не дожидался и за 90 с — берём по 50.
import { mapSkills } from './skillMap.js';

export const TRUDVSEM_API = 'https://opendata.trudvsem.ru/api/v1';

/** Регионы пилота: Москва (РАНХиГС) и Татарстан (финал в Казани). Коды — из ответа API (region.region_code). */
export const PILOT_REGIONS = ['7700000000000', '1600000000000'] as const;

/** Города федерального значения: для них регион и есть город, если в адресе города нет. */
const FEDERAL_CITIES: Record<string, string> = {
  '7700000000000': 'Москва',
  '7800000000000': 'Санкт-Петербург',
  '9200000000000': 'Севастополь',
};

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
  employment?: string;
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
  /** Тип места (#22): «практикант» — практика, неполный день или временная работа — подработка, иначе стажировка. */
  type: 'practice' | 'internship' | 'part_time';
  /** Оплата: зарплата указана — оплачиваемое, сумма из вакансии; не указана — неизвестно (null). */
  paid: boolean | null;
  salary: number | null;
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
    employment: v.employment,
    duty: stripContacts(v.duty),
    requirements: stripContacts(v.requirements),
    skills: v.skills,
    salary_min: v.salary_min,
    salary_max: v.salary_max,
    work_places: v.work_places,
    vac_url: v.vac_url,
    requirement: { experience: v.requirement?.experience },
    'creation-date': v['creation-date'],
  };
}

// Почта, в том числе на кириллических доменах (hr@компания.рф)
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+/gu;
// +7 или 8 и ровно 10 цифр с любыми разделителями: +7 (495) 123-45-67, +7 (8552) 12-34-56, 8 912 345 67 89
const PHONE = /(\+7|(?<!\d)8)([\s()-]*\d){10}(?!\d)/g;

/**
 * Кавычки-«ёлочки» вместо прямых и «лапок» в названиях: `ООО "АРС НЕДВИЖИМОСТЬ"` → `ООО «АРС НЕДВИЖИМОСТЬ»`.
 * Открывающая — в начале строки или после пробела и скобки, иначе закрывающая. Регистр не трогаем: в капсе бывают
 * аббревиатуры (ООО, ИП, АО, IT). Непарную кавычку на конце не дописываем — только меняем вид.
 */
export function typographQuotes(text: string): string {
  return text
    .replace(/[„“”]/g, '"')
    .replace(/(^|[\s([«])"/g, '$1«')
    .replace(/"/g, '»');
}

/** Телефоны и почта из свободного текста обязанностей и требований — не храним. */
export function stripContacts(text: string | undefined): string | undefined {
  return text?.replace(EMAIL, '[контакт скрыт]').replace(PHONE, '[контакт скрыт]');
}

/**
 * Город: из адреса («г Казань, …» или «г. Казань»); если в адресе города нет — только для городов федерального
 * значения. Иначе null: место в районе («Елабужский р-н») нельзя выдавать за место в столице региона.
 */
export function cityOf(v: TrudvsemVacancy): string | null {
  const location = v.addresses?.address?.[0]?.location ?? '';
  const m = /(?:^|,\s*)г\.?\s+([А-ЯЁ][А-ЯЁа-яё-]*(?:\s[А-ЯЁ][а-яё-]+)?)/.exec(location);
  if (m) return m[1]!;
  return FEDERAL_CITIES[v.region?.region_code ?? ''] ?? null;
}

/** Удалёнка в API — в employment («Дистанционная (удаленная) работа»), иногда и в schedule. */
export const formatOf = (v: TrudvsemVacancy): 'office' | 'remote' =>
  /удал[её]нн|дистанцион/i.test(`${v.employment ?? ''} ${v.schedule ?? ''}`) ? 'remote' : 'office';

/** Ссылка на оригинал — только на trudvsem.ru по https. */
export function safeSourceUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && /(^|\.)trudvsem\.ru$/.test(u.hostname) ? `https://${u.host}${u.pathname}` : null;
  } catch {
    return null;
  }
}

const MAX_REQUIRED = 5;
/** Описание короткое: карточке хватает задач и требований, полный текст — по ссылке на оригинал. */
const MAX_DESCRIPTION = 1500;

/** Место для студента, а не просто вакансия, где «стажёр» мелькнул в тексте. */
export const STUDENT_TITLE = /стаж[её]р|стажир|практикант|практик[аи]|младш|помощник|ассистент|начинающ|студент|без опыта/i;
/** Продажа недвижимости «со стажировкой и обучением» — не место для студента по специальности. */
export const NOT_FOR_STUDENTS = /ри[еэ]лт|недвижимост/i;

/**
 * Вакансия → место. null — не берём: нужен опыт; в названии нет признака студенческого места или это продажа
 * недвижимости; ни один навык не сопоставился со справочником (без навыков совпадение было бы 100 % у всех);
 * очное место без понятного города.
 */
export function mapVacancy(v: TrudvsemVacancy): ImportedPlace | null {
  const title = v['job-name'] ?? '';
  if (!v.id || !title) return null;
  if ((v.requirement?.experience ?? 0) > 1) return null;
  if (!STUDENT_TITLE.test(title) || NOT_FOR_STUDENTS.test(title)) return null;
  // Поле skills у большинства вакансий пустое — навыки ищем ещё в названии, требованиях и обязанностях
  const skills = mapSkills([title, ...(v.skills ?? []), v.requirements ?? '', v.duty ?? '']).slice(0, MAX_REQUIRED);
  if (!skills.length) return null;

  const format = formatOf(v);
  const city = format === 'remote' ? null : cityOf(v);
  if (format === 'office' && !city) return null;

  const salary = v.salary_min ? `Зарплата: от ${v.salary_min} ₽.` : '';
  const description = [stripContacts(v.duty), v.requirements ? `Требования: ${stripContacts(v.requirements)}` : '', salary, 'Источник — «Работа России».']
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join('\n\n');

  return {
    sourceId: v.id,
    sourceUrl: safeSourceUrl(v.vac_url),
    title: typographQuotes(title.trim()).slice(0, 200),
    companyName: typographQuotes((v.company?.name ?? 'Работодатель с «Работа России»').trim()).slice(0, 200),
    description: description.length > MAX_DESCRIPTION ? `${description.slice(0, MAX_DESCRIPTION - 1)}…` : description,
    requiredSkills: skills,
    format,
    city,
    slots: Math.min(Math.max(v.work_places ?? 1, 1), 100),
    type: placeTypeOf(v),
    paid: salaryOf(v) ? true : null,
    salary: salaryOf(v),
  };
}

export function placeTypeOf(v: TrudvsemVacancy): ImportedPlace['type'] {
  if (/практикант|практик[аи]/i.test(v['job-name'] ?? '')) return 'practice';
  if (/неполн|частичн|временн|подработк/i.test(`${v.schedule ?? ''} ${v.employment ?? ''}`)) return 'part_time';
  return 'internship';
}

/** Разумная зарплата в месяц, ₽. Кривое значение (0,4 или 3 млрд) не должно ронять весь импорт на CHECK/integer. */
const SALARY_RANGE = { min: 1, max: 10_000_000 } as const;

/** Зарплата в месяц, ₽: минимальная из вакансии, если она в разумном диапазоне; иначе null. */
export function salaryOf(v: TrudvsemVacancy): number | null {
  const s = Math.round(Number(v.salary_min));
  return Number.isFinite(s) && s >= SALARY_RANGE.min && s <= SALARY_RANGE.max ? s : null;
}

/** Вакансий на страницу. */
export const PAGE_LIMIT = 50;
/** Больше страниц не листаем: по запросам пилота вакансий меньше сотни. */
export const MAX_PAGES = 4;

export interface FetchOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  limit?: number;
}

/** Одна страница. Бросает ошибку при таймауте, сети или не-200. */
export async function fetchPage(
  regionCode: string,
  text: string,
  page: number,
  opts: FetchOptions = {},
): Promise<{ vacancies: TrudvsemVacancy[]; total: number }> {
  const url = `${TRUDVSEM_API}/vacancies/region/${regionCode}?text=${encodeURIComponent(text)}&offset=${page}&limit=${opts.limit ?? PAGE_LIMIT}`;
  const res = await (opts.fetch ?? fetch)(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { meta?: { total?: number }; results?: { vacancies?: { vacancy: TrudvsemVacancy }[] } };
  const vacancies = (body.results?.vacancies ?? []).map((x) => x.vacancy);
  return { vacancies, total: body.meta?.total ?? vacancies.length };
}

/** Все страницы по региону и запросу — до meta.total, но не больше MAX_PAGES. complete — получили всё. */
export async function fetchAll(regionCode: string, text: string, opts: FetchOptions = {}): Promise<{ vacancies: TrudvsemVacancy[]; complete: boolean }> {
  const limit = opts.limit ?? PAGE_LIMIT;
  const all: TrudvsemVacancy[] = [];
  let total = Infinity;
  for (let page = 0; page < MAX_PAGES && page * limit < total; page++) {
    const r = await fetchPage(regionCode, text, page, opts);
    total = r.total;
    all.push(...r.vacancies);
    if (r.vacancies.length < limit) break;
  }
  return { vacancies: all, complete: all.length >= total };
}

export interface PilotFetch {
  vacancies: TrudvsemVacancy[];
  /** Сколько пар «регион × запрос» не удалось получить целиком. */
  failed: number;
  total: number;
  /** Причины сбоев — в лог, чтобы при смене формата API было видно, почему импорт берёт снимок. */
  errors: string[];
}

/**
 * Все регионы и запросы пилота; дубли по id убираем. Сбой одного запроса не отменяет остальные.
 * Запрос, у которого получены не все страницы, считается неудачным: по нему нельзя закрывать пропавшие вакансии.
 */
export async function fetchPilotVacancies(opts: FetchOptions = {}): Promise<PilotFetch> {
  const byId = new Map<string, TrudvsemVacancy>();
  const errors: string[] = [];
  let total = 0;
  for (const region of PILOT_REGIONS) {
    for (const q of QUERIES) {
      total++;
      try {
        const r = await fetchAll(region, q, opts);
        for (const v of r.vacancies) byId.set(v.id, pickFields(v));
        if (!r.complete) errors.push(`${region} «${q}»: получены не все страницы`);
      } catch (err) {
        errors.push(`${region} «${q}»: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
      }
    }
  }
  return { vacancies: [...byId.values()], failed: errors.length, total, errors };
}
