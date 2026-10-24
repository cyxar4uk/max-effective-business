import { CLOSE_SKILLS, type CloseSkills } from '../seed/closeSkills.js';
import type {
  CloseSkill,
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
 * Половинки за близкие навыки — тоже в целых: закрытые и всего передаются в половинах (см. matchStudentToInternship).
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

/**
 * Близкие навыки студента к недостающим требованиям (#71): требование → навык студента. Навык студента засчитывается
 * один раз: либо точно, либо близким к одному требованию — иначе один Ozon закрывал бы и Wildberries, и карточки
 * товаров, и процент «плыл» вверх. Из нескольких раскладов берём тот, где закрыто больше требований, — паросочетание
 * Куна (списки по 5–10 навыков). Требования идут по порядку `needs`: уже закрытое более поздним не открывается, поэтому
 * при обязательных впереди их закрыто максимум, а желательные закрываются тем, что осталось.
 * `free` — навыки студента, не совпавшие точно ни с одним требованием.
 */
function closeFor(needs: readonly SkillCode[], free: ReadonlySet<SkillCode>, close: CloseSkills): Map<SkillCode, SkillCode> {
  const needOf = new Map<SkillCode, SkillCode>(); // навык студента → требование, которое он закрывает
  const assign = (need: SkillCode, seen: Set<SkillCode>): boolean => {
    for (const have of close.get(need) ?? []) {
      if (!free.has(have) || seen.has(have)) continue;
      seen.add(have);
      const taken = needOf.get(have);
      if (taken === undefined || assign(taken, seen)) {
        needOf.set(have, need);
        return true;
      }
    }
    return false;
  };
  for (const need of needs) assign(need, new Set());
  return new Map([...needOf].map(([have, need]) => [need, have] as const));
}

function closeList(needs: readonly SkillCode[], haveOf: ReadonlyMap<SkillCode, SkillCode>): CloseSkill[] {
  return needs.flatMap((need) => {
    const have = haveOf.get(need);
    return have === undefined ? [] : [{ need, have }];
  });
}

/**
 * Считает совпадение студента со стажировкой. Чистая функция: без БД, сети и времени.
 * Требование, которого у студента нет, но есть близкий навык (seed/closeSkills.ts), даёт половину своего веса.
 * Сначала точные совпадения, затем близкие к обязательным, затем к желательным: у обязательных вес больше.
 */
export function matchStudentToInternship(
  student: StudentMatchInput,
  internship: InternshipMatchInput,
  close: CloseSkills = CLOSE_SKILLS,
): MatchResult {
  const studentSkills = new Set(student.skills);
  const must = unique(internship.requiredSkills);
  // Навык, указанный и обязательным, и желательным, считаем обязательным.
  const mustSet = new Set(must);
  const nice = unique(internship.niceSkills).filter((id) => !mustSet.has(id));

  const mustMatched = must.filter((id) => studentSkills.has(id));
  const mustMissing = must.filter((id) => !studentSkills.has(id));
  const niceMatched = nice.filter((id) => studentSkills.has(id));
  const niceMissing = nice.filter((id) => !studentSkills.has(id));

  // Навыки студента, которые не совпали ни с одним требованием точно, — кандидаты в близкие
  const niceSet = new Set(nice);
  const free = new Set(student.skills.filter((id) => !mustSet.has(id) && !niceSet.has(id)));
  // Один расклад на обязательные и желательные сразу: иначе обязательный мог бы забрать навык, нужный желательному,
  // хотя у него есть запасной близкий
  const haveOf = closeFor([...mustMissing, ...niceMissing], free, close);
  const mustClose = closeList(mustMissing, haveOf);
  const niceClose = closeList(niceMissing, haveOf);

  const filterFailures = checkFilters(student, internship);

  return {
    // В половинах: точное совпадение — 2, близкое — 1, всего — 2 на навык
    score: computeScore(
      2 * mustMatched.length + mustClose.length,
      2 * must.length,
      2 * niceMatched.length + niceClose.length,
      2 * nice.length,
    ),
    passesFilters: filterFailures.length === 0,
    filterFailures,
    mustMatched,
    mustMissing,
    niceMatched,
    niceMissing,
    mustClose,
    niceClose,
  };
}

/** Расшифровка для API и БД (`interests.match`): результат без фильтров — они видны по тому, показано ли место. */
export type MatchBreakdownOf = Pick<
  MatchResult,
  'score' | 'mustMatched' | 'mustMissing' | 'niceMatched' | 'niceMissing' | 'mustClose' | 'niceClose'
>;

export function matchBreakdown(r: MatchResult): MatchBreakdownOf {
  const { score, mustMatched, mustMissing, niceMatched, niceMissing, mustClose, niceClose } = r;
  return { score, mustMatched, mustMissing, niceMatched, niceMissing, mustClose, niceClose };
}

/**
 * Присылать ли студенту уведомление о стажировке: фильтры пройдены, процент не ниже порога и закрыты **все**
 * обязательные навыки. Без последнего условия студент без одного обязательного навыка, но со всеми желательными
 * получал 35 + 30 = 65 % и уведомление: «обязательные» были не обязательными (#82). В ленте такие места остаются,
 * но стоят ниже (compareForFeed).
 * Близкий навык обязательный не закрывает (#71): он в mustMissing, и уведомления нет — бот пишет только о местах,
 * где студент уже умеет всё обязательное; Ozon вместо Wildberries студент увидит в ленте.
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
