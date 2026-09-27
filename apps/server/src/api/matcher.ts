import type { MatchBreakdown, WorkFormat } from '../db/entities.js';

// Контракт между API и модулем matching (Тимур). API зовёт только эту функцию.
export interface MatchStudent {
  skills: string[];
  formats: WorkFormat[];
  city: string;
}

export interface MatchInternship {
  requiredSkills: string[];
  niceSkills: string[];
  format: WorkFormat;
  city: string | null;
}

// eligible — прошёл жёсткие фильтры (формат; город для очных и гибридных)
export type Matcher = (student: MatchStudent, internship: MatchInternship) => { eligible: boolean; match: MatchBreakdown };

// ВРЕМЕННО, пока нет модуля matching: простая реализация правил из docs/03_product.md,
// чтобы API и мини-приложение работали сквозь. Тимур заменяет её своей в src/index.ts.
export const temporaryMatcher: Matcher = (student, internship) => {
  const have = new Set(student.skills);
  const split = (list: string[]) => [list.filter((s) => have.has(s)), list.filter((s) => !have.has(s))] as const;
  const [mustMatched, mustMissing] = split(internship.requiredSkills);
  const [niceMatched, niceMissing] = split(internship.niceSkills);

  const mustShare = internship.requiredSkills.length ? mustMatched.length / internship.requiredSkills.length : 1;
  const score = internship.niceSkills.length
    ? 0.7 * mustShare + 0.3 * (niceMatched.length / internship.niceSkills.length)
    : mustShare;

  const sameCity = (internship.city ?? '').trim().toLowerCase() === student.city.trim().toLowerCase();
  const eligible = student.formats.includes(internship.format) && (internship.format === 'remote' || sameCity);

  return { eligible, match: { score: Math.round(score * 100), mustMatched, mustMissing, niceMatched, niceMissing } };
};
