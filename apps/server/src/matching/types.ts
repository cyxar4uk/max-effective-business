/**
 * Типы расчёта совпадения студента и стажировки.
 * Модуль не знает про БД, HTTP и MAX: на вход — уже загруженные данные, на выход — результат.
 */

/** Код навыка из справочника (`skills.code`). */
export type SkillCode = string;

/** Формат работы: `office` — очно, `hybrid` — часть времени очно, `remote` — удалённо. */
export type WorkFormat = 'office' | 'hybrid' | 'remote';

export interface StudentMatchInput {
  skills: readonly SkillCode[];
  /** Форматы, которые студенту подходят. */
  formats: readonly WorkFormat[];
  /** Город студента. Не указан — очные и гибридные стажировки не проходят фильтр. */
  city: string | null;
}

export interface InternshipMatchInput {
  requiredSkills: readonly SkillCode[];
  niceSkills: readonly SkillCode[];
  format: WorkFormat;
  /** Город стажировки. Для удалённых не проверяется. */
  city: string | null;
}

/** Почему не пройден жёсткий фильтр. */
export type FilterFailure = 'format' | 'city';

export interface MatchResult {
  /** Процент совпадения, целое 0–100. Считается и при непройденных фильтрах. */
  score: number;
  /** Пройдены ли жёсткие фильтры. Если нет, стажировку студенту не показываем и не присылаем. */
  passesFilters: boolean;
  filterFailures: FilterFailure[];
  mustMatched: SkillCode[];
  mustMissing: SkillCode[];
  niceMatched: SkillCode[];
  niceMissing: SkillCode[];
}
