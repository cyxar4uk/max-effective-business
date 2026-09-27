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

/** Приводит название города к виду для сравнения: регистр, пробелы, «ё». */
export function normalizeCity(city: string | null | undefined): string {
  return (city ?? '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/ё/g, 'е');
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

/** Присылать ли студенту уведомление о стажировке. */
export function shouldNotify(result: MatchResult, threshold: number = DEFAULT_NOTIFY_THRESHOLD): boolean {
  return result.passesFilters && result.score >= threshold;
}
