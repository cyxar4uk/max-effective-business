import type { MatchBreakdown, WorkFormat } from '../db/entities.js';

// Контракт между API и модулем matching (Тимур). API зовёт только эту функцию; реализация — src/matching.
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
