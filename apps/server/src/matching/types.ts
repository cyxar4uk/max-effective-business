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

/**
 * Требование места закрыто близким навыком (#71): у студента нет `need`, но есть близкий `have`
 * (seed/closeSkills.ts). Засчитывается половина веса `need`.
 */
export interface CloseSkill {
  need: SkillCode;
  have: SkillCode;
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
  /** Обязательные, которых у студента нет. Закрытые близким навыком тоже здесь: обязательный навык не закрыт. */
  mustMissing: SkillCode[];
  niceMatched: SkillCode[];
  /** Желательные, которых у студента нет, в том числе закрытые близким навыком. */
  niceMissing: SkillCode[];
  /** Часть mustMissing, закрытая близким навыком наполовину, — в порядке mustMissing. */
  mustClose: CloseSkill[];
  /** Часть niceMissing, закрытая близким навыком наполовину. */
  niceClose: CloseSkill[];
}
