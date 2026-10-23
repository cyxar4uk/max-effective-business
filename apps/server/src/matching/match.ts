import type {
  FilterFailure,
  InternshipMatchInput,
  MatchResult,
  SkillCode,
  StudentMatchInput,
  WorkFormat,
} from './types.js';

/** Порог уведомления студента о новой стажировке по умолчанию. Реальное значение — из конфига сервера. */
export const DEFAULT_NOTIFY_THRESHOLD = 60;

/** Вес обязательных навыков, в процентах. Желательные — остаток до 100. */
export const MUST_WEIGHT = 70;
export const NICE_WEIGHT = 100 - MUST_WEIGHT;

/** Форматы, для которых город студента должен совпадать с городом стажировки. */
export const CITY_BOUND_FORMATS: readonly WorkFormat[] = ['office', 'hybrid'];

/**
 * Как студенты пишут города пилота в анкете (город — свободный текст) → каноническое название после нормализации.
 * Только Москва, Петербург и Казань: там пилот и финал; прочие города сравниваются как написаны.
 */
const CITY_ALIASES: Readonly<Record<string, string>> = {
  мск: 'москва',
  moscow: 'москва',
  moskva: 'москва',
  спб: 'санкт-петербург',
  питер: 'санкт-петербург',
  петербург: 'санкт-петербург',
  'с-петербург': 'санкт-петербург',
  'санкт петербург': 'санкт-петербург',
  'saint petersburg': 'санкт-петербург',
  'st. petersburg': 'санкт-петербург',
  'st petersburg': 'санкт-петербург',
  'sankt-peterburg': 'санкт-петербург',
  kazan: 'казань',
};

/** Часть адреса — страна или регион, а не город: «Россия», «Республика Татарстан», «Московская обл.», «РТ». */
const NOT_A_CITY =
  /^(россия|russia|рф|российская федерация)$|(^|\s)(обл\.?|область|край|республика|респ\.?|автономн\S*|округ|ао|район|р-н)(\s|$)|^(татарстан|рт|башкортостан|башкирия|рб|tatarstan|удмуртия|чувашия|мордовия|марий эл|подмосковье|югра|(хмао|янао)(-югра)?)$/;

/** Страна в конце без запятой — «Москва Россия», «Kazan Russia»: так тоже пишут, и до #101 это работало. */
const COUNTRY_TAIL = /\s+(россия|russia|рф)\.?$/;

/**
 * Приводит название города к виду для сравнения: регистр, пробелы, «ё», дефис без пробелов, приставка «г.» или
 * «город», уточнения в скобках, страна и регион через запятую в любом порядке («Казань, Татарстан»,
 * «Республика Татарстан, Казань», «Москва, Россия»), сокращения городов пилота («Мск», «СПб», «Питер»).
 */
export function normalizeCity(city: string | null | undefined): string {
  const parts = (city ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;]/)
    .map((part) =>
      part
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\s*-\s*/g, '-')
        .replace(/^(г\.|г |город )\s*/, '')
        .replace(/\.$/, '')
        .replace(COUNTRY_TAIL, '')
        .trim(),
    )
    .filter(Boolean);
  // Город — первая часть, которая не страна и не регион; если такой нет — первая часть как есть
  const base = parts.find((part) => !NOT_A_CITY.test(part)) ?? parts[0] ?? '';
  return CITY_ALIASES[base] ?? base;
}

/** Жёсткие фильтры: формат работы и город для очных форматов. */
export function checkFilters(student: StudentMatchInput, internship: InternshipMatchInput): FilterFailure[] {
  const failures: FilterFailure[] = [];
  if (!student.formats.includes(internship.format)) {
    failures.push('format');
  }
  if (CITY_BOUND_FORMATS.includes(internship.format)) {
    const studentCity = normalizeCity(student.city);
    if (studentCity === '' || studentCity !== normalizeCity(internship.city)) {
      failures.push('city');
    }
  }
  return failures;
}

/**
 * Процент по правилу из docs/03_product.md:
 * 70 % × доля закрытых обязательных + 30 % × доля закрытых желательных.
 * Нет желательных — только обязательные; нет обязательных — только желательные; нет никаких требований — 100.
 * Считаем в целых числах, чтобы округление половины шло всегда вверх, без ошибок плавающей точки.
 */
export function computeScore(mustMatched: number, mustTotal: number, niceMatched: number, niceTotal: number): number {
  let numerator: number;
  let denominator: number;
  if (mustTotal > 0 && niceTotal > 0) {
    numerator = MUST_WEIGHT * mustMatched * niceTotal + NICE_WEIGHT * niceMatched * mustTotal;
    denominator = mustTotal * niceTotal;
  } else if (mustTotal > 0) {
    numerator = 100 * mustMatched;
    denominator = mustTotal;
  } else if (niceTotal > 0) {
    numerator = 100 * niceMatched;
    denominator = niceTotal;
  } else {
    return 100;
  }
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

function unique(ids: readonly SkillCode[]): SkillCode[] {
  return [...new Set(ids)];
}

/** Считает совпадение студента со стажировкой. Чистая функция: без БД, сети и времени. */
export function matchStudentToInternship(student: StudentMatchInput, internship: InternshipMatchInput): MatchResult {
  const studentSkills = new Set(student.skills);
  const must = unique(internship.requiredSkills);
  // Навык, указанный и обязательным, и желательным, считаем обязательным.
  const mustSet = new Set(must);
  const nice = unique(internship.niceSkills).filter((id) => !mustSet.has(id));

  const mustMatched = must.filter((id) => studentSkills.has(id));
  const mustMissing = must.filter((id) => !studentSkills.has(id));
  const niceMatched = nice.filter((id) => studentSkills.has(id));
  const niceMissing = nice.filter((id) => !studentSkills.has(id));

  const filterFailures = checkFilters(student, internship);

  return {
    score: computeScore(mustMatched.length, must.length, niceMatched.length, nice.length),
    passesFilters: filterFailures.length === 0,
    filterFailures,
    mustMatched,
    mustMissing,
    niceMatched,
    niceMissing,
  };
}

/**
 * Присылать ли студенту уведомление о стажировке: фильтры пройдены, процент не ниже порога и закрыты **все**
 * обязательные навыки. Без последнего условия студент без одного обязательного навыка, но со всеми желательными
 * получал 35 + 30 = 65 % и уведомление: «обязательные» были не обязательными (#82). В ленте такие места остаются,
 * но стоят ниже (compareForFeed).
 */
export function shouldNotify(result: MatchResult, threshold: number = DEFAULT_NOTIFY_THRESHOLD): boolean {
  return result.passesFilters && result.score >= threshold && result.mustMissing.length === 0;
}

/**
 * Попадает ли месяц практики студента (`ГГГГ-ММ`) в сроки места. У места без сроков — да.
 * null — студент месяц не указал. Даты — строки `ГГГГ-ММ-ДД`, сравниваются как строки.
 */
export function practiceMonthFits(
  month: string | null | undefined,
  startsOn: string | null | undefined,
  endsOn: string | null | undefined,
): boolean | null {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  return (!endsOn || endsOn >= monthStart) && (!startsOn || startsOn <= monthEnd);
}

export interface FeedRankInput {
  match: Pick<MatchResult, 'score' | 'mustMissing'>;
  /** practiceMonthFits: true — по срокам подходит, false — нет, null — неизвестно. */
  datesFit: boolean | null;
}

/**
 * Порядок ленты студента. Процент — главный; при равном проценте выше место, где закрыты все обязательные навыки,
 * затем подходящее по месяцу практики. Остальное — как пришло (сначала новые): сортировка устойчивая.
 * Процент от этого не меняется — только порядок.
 */
export function compareForFeed(a: FeedRankInput, b: FeedRankInput): number {
  return (
    b.match.score - a.match.score ||
    a.match.mustMissing.length - b.match.mustMissing.length ||
    Number(b.datesFit === true) - Number(a.datesFit === true)
  );
}
