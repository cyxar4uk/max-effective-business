// Теги задач: чем студент займётся на месте («Сайт», «Маркетплейсы», «1С»…). Черновик Артёма — team/artyom/skills_edits.md.
// Тег подставляет навыки в форму работодателя (он их правит) и фильтрует ленту студента.
// В расчёте совпадения теги не участвуют — считаются только навыки.
// Код тега после публикации мест не меняем: на него ссылаются места.

export interface TaskTag {
  code: string;
  name: string;
  /** Коды навыков из справочника, которые тег подставляет в форму. */
  skills: string[];
}

export const TASK_TAGS: TaskTag[] = [
  { code: 'website', name: 'Сайт', skills: ['no_code', 'wordpress', 'html_css', 'seo'] },
  { code: 'marketplaces', name: 'Маркетплейсы', skills: ['marketplace_cards', 'wildberries', 'ozon', 'product_photo', 'unit_economics'] },
  { code: 'one_c', name: '1С', skills: ['1c_accounting', '1c_trade', '1c_programming'] },
  { code: 'social_ads', name: 'Соцсети и реклама', skills: ['smm', 'copywriting', 'targeted_ads', 'canva', 'video_editing'] },
  { code: 'spreadsheets', name: 'Таблицы и аналитика', skills: ['excel', 'google_sheets', 'data_visualization', 'power_bi'] },
  { code: 'sales', name: 'Продажи и клиенты', skills: ['sales', 'crm', 'avito', 'customer_support'] },
];

/** Сколько тегов может быть у места — как в API (schemas.ts). */
export const MAX_PLACE_TAGS = 3;

/**
 * Теги для места, которое создал не работодатель через форму (тестовые места, «Работа России»): тег ставится, если
 * среди обязательных навыков места есть навык тега. Без этого фильтр ленты по тегам таких мест не находит.
 * Порядок — как в TASK_TAGS, не больше MAX_PLACE_TAGS.
 */
export function tagsForSkills(requiredSkills: readonly string[], tags: readonly TaskTag[] = TASK_TAGS): string[] {
  const required = new Set(requiredSkills);
  return tags.filter((t) => t.skills.some((s) => required.has(s))).map((t) => t.code).slice(0, MAX_PLACE_TAGS);
}
