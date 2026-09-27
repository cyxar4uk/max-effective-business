// Расчёт совпадения (Тимур): чистые функции без БД и сети, правила — docs/03_product.md.
// Формат результата — docs/api.md, раздел «Совпадение match».
import type { Matcher } from '../api/matcher.js';
import { matchStudentToInternship } from './match.js';

export * from './types.js';
export * from './match.js';

/** Реализация контракта API `Matcher` (src/api/matcher.ts). */
export const matcher: Matcher = (student, internship) => {
  const { passesFilters, score, mustMatched, mustMissing, niceMatched, niceMissing } = matchStudentToInternship(
    student,
    internship,
  );
  return { eligible: passesFilters, match: { score, mustMatched, mustMissing, niceMatched, niceMissing } };
};
