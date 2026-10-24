// Близкие навыки (#71): пары из справочника (skills.ts), которые малый бизнес считает взаимозаменяемыми —
// студент со вторым навыком быстро освоит первый. Подбор засчитывает такой навык за половину (matching/match.ts).
//
// Только очевидные пары, без цепочек: близость не переходит дальше пары (Wildberries ~ Ozon и Ozon ~ карточки
// не делают Wildberries близким к чему-то ещё). Пара симметрична, порядок внутри пары не важен.
// Навыки одного направления, но разного содержания (SQL и Python, Директ и Метрика), и редактор вместо профессии
// (Canva, Photoshop или Figma вместо дизайна) сюда не идут. 1С: Бухгалтерия и бухучёт — пара: бухучёт ведут в 1С. Английский B1 и B2 — тоже нет: «B2 и выше» закрывает B1 целиком,
// а половина занизила бы процент.

export const CLOSE_SKILL_PAIRS: readonly (readonly [string, string])[] = [
  // Аналитика и данные
  ['excel', 'google_sheets'],
  ['power_bi', 'data_visualization'],
  // Маркетплейсы
  ['wildberries', 'ozon'],
  ['marketplace_cards', 'wildberries'],
  ['marketplace_cards', 'ozon'],
  // Экономика, финансы, 1С
  ['1c_accounting', '1c_trade'],
  ['1c_accounting', '1c_zup'],
  ['1c_accounting', 'accounting'],
  ['accounting', 'tax_accounting'],
  ['financial_analysis', 'financial_modeling'],
  ['financial_analysis', 'investment_analysis'],
  ['financial_modeling', 'budgeting'],
  // Маркетинг
  ['smm', 'content_marketing'],
  ['smm', 'targeted_ads'],
  ['copywriting', 'content_marketing'],
  ['targeted_ads', 'context_ads'],
  ['reviews_management', 'customer_support'],
  // Продажи
  ['sales', 'b2b_sales'],
  // Право и кадры
  ['civil_law', 'contract_law'],
  ['legal_research', 'consultant_plus'],
  ['labor_law', 'hr_admin'],
  ['records_management', 'hr_admin'],
  ['hr_admin', '1c_zup'],
  // Сайты и разработка
  ['no_code', 'wordpress'],
  ['javascript', 'react'],
  ['javascript', 'nodejs'],
  // Логистика
  ['logistics', 'supply_chain'],
  ['logistics', 'warehouse'],
];

/** Код навыка → близкие к нему коды. Порядок — как в CLOSE_SKILL_PAIRS. */
export type CloseSkills = ReadonlyMap<string, readonly string[]>;

export function closeSkillsMap(pairs: readonly (readonly [string, string])[] = CLOSE_SKILL_PAIRS): CloseSkills {
  const map = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    const list = map.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    map.set(from, list);
  };
  for (const [a, b] of pairs) {
    if (a === b) continue;
    add(a, b);
    add(b, a);
  }
  return map;
}

export const CLOSE_SKILLS: CloseSkills = closeSkillsMap();

/** Навыки студента вместе с близкими к ним — для грубого SQL-фильтра ленты: без них место «только с близким» не найти. */
export function withCloseSkills(skills: readonly string[], close: CloseSkills = CLOSE_SKILLS): string[] {
  return [...new Set(skills.flatMap((s) => [s, ...(close.get(s) ?? [])]))];
}
