// Справочник навыков: направления РАНХиГС + задачи малого бизнеса. Согласован Артёмом 28.09 (team/artyom/skills_edits.md).
// Код навыка после загрузки не меняем: на него ссылаются анкеты и стажировки. Название и группу менять можно.
// Навык, который убрали отсюда, из базы не удаляется — чтобы не сломать сохранённые анкеты.

export interface SkillSeed {
  code: string;
  name: string;
}

export interface SkillGroupSeed {
  group: string;
  skills: SkillSeed[];
}

export const SKILL_GROUPS: SkillGroupSeed[] = [
  {
    group: 'Аналитика и данные',
    skills: [
      { code: 'excel', name: 'Excel' },
      { code: 'google_sheets', name: 'Google Таблицы' },
      { code: 'sql', name: 'SQL' },
      { code: 'power_bi', name: 'Power BI' },
      { code: 'python', name: 'Python' },
      { code: 'statistics', name: 'Статистика' },
      { code: 'data_visualization', name: 'Визуализация данных' },
      { code: 'market_research', name: 'Исследование рынка' },
    ],
  },
  {
    group: 'Маркетплейсы и онлайн-продажи',
    skills: [
      { code: 'marketplace_cards', name: 'Карточки товаров на маркетплейсах' },
      { code: 'wildberries', name: 'Личный кабинет Wildberries' },
      { code: 'ozon', name: 'Личный кабинет Ozon' },
      { code: 'marketplace_analytics', name: 'Аналитика продаж на маркетплейсах' },
      { code: 'unit_economics', name: 'Юнит-экономика' },
      { code: 'avito', name: 'Продвижение на Авито' },
      { code: 'product_photo', name: 'Предметная фотосъёмка' },
    ],
  },
  {
    group: 'Экономика и финансы',
    skills: [
      { code: 'financial_analysis', name: 'Финансовый анализ' },
      { code: 'financial_modeling', name: 'Финансовое моделирование' },
      { code: 'budgeting', name: 'Бюджетирование' },
      { code: 'accounting', name: 'Бухгалтерский учёт' },
      { code: '1c_accounting', name: '1С: Бухгалтерия' },
      { code: '1c_trade', name: '1С: Управление торговлей' },
      { code: 'tax_accounting', name: 'Налоговый учёт' },
      { code: 'ifrs', name: 'МСФО' },
      { code: 'investment_analysis', name: 'Инвестиционный анализ' },
    ],
  },
  {
    group: 'Маркетинг и PR',
    skills: [
      { code: 'smm', name: 'Ведение соцсетей' },
      { code: 'copywriting', name: 'Копирайтинг' },
      { code: 'content_marketing', name: 'Контент-маркетинг' },
      { code: 'targeted_ads', name: 'Таргетированная реклама' },
      { code: 'context_ads', name: 'Контекстная реклама (Яндекс Директ)' },
      { code: 'seo', name: 'SEO' },
      { code: 'web_analytics', name: 'Веб-аналитика (Яндекс Метрика)' },
      { code: 'pr', name: 'PR и работа со СМИ' },
      { code: 'event_management', name: 'Организация мероприятий' },
      { code: 'email_marketing', name: 'Email-рассылки' },
      { code: 'reviews_management', name: 'Работа с отзывами' },
    ],
  },
  {
    group: 'Продажи и клиенты',
    skills: [
      { code: 'sales', name: 'Продажи' },
      { code: 'b2b_sales', name: 'B2B-продажи' },
      { code: 'crm', name: 'Работа в CRM' },
      { code: 'customer_support', name: 'Клиентская поддержка' },
      { code: 'negotiations', name: 'Переговоры' },
    ],
  },
  {
    group: 'Право',
    skills: [
      { code: 'civil_law', name: 'Гражданское право' },
      { code: 'contract_law', name: 'Договорная работа' },
      { code: 'corporate_law', name: 'Корпоративное право' },
      { code: 'labor_law', name: 'Трудовое право' },
      { code: 'legal_research', name: 'Правовой анализ' },
      { code: 'consultant_plus', name: 'КонсультантПлюс, Гарант' },
      { code: 'public_procurement', name: 'Госзакупки (44-ФЗ, 223-ФЗ)' },
    ],
  },
  {
    group: 'Управление и HR',
    skills: [
      { code: 'project_management', name: 'Управление проектами' },
      { code: 'business_processes', name: 'Описание бизнес-процессов' },
      { code: 'public_administration', name: 'Государственное управление' },
      { code: 'records_management', name: 'Делопроизводство' },
      { code: 'recruiting', name: 'Подбор персонала' },
      { code: 'hr_admin', name: 'Кадровое делопроизводство' },
      { code: '1c_zup', name: '1С: Зарплата и кадры' },
      { code: 'training', name: 'Обучение персонала' },
    ],
  },
  {
    group: 'IT и разработка',
    skills: [
      { code: 'html_css', name: 'HTML и CSS' },
      { code: 'javascript', name: 'JavaScript' },
      { code: 'react', name: 'React' },
      { code: 'nodejs', name: 'Node.js' },
      { code: 'git', name: 'Git' },
      { code: 'qa_testing', name: 'Тестирование ПО' },
      { code: '1c_programming', name: 'Программирование 1С' },
      { code: 'no_code', name: 'Tilda и конструкторы сайтов' },
      { code: 'wordpress', name: 'WordPress' },
      { code: 'chatbots', name: 'Чат-боты без программирования' },
    ],
  },
  {
    group: 'Дизайн и контент',
    skills: [
      { code: 'figma', name: 'Figma' },
      { code: 'ui_ux', name: 'UI/UX-дизайн' },
      { code: 'graphic_design', name: 'Графический дизайн' },
      { code: 'photoshop', name: 'Photoshop' },
      { code: 'video_editing', name: 'Монтаж видео' },
      { code: 'presentations', name: 'Презентации' },
      { code: 'canva', name: 'Canva' },
    ],
  },
  {
    group: 'Логистика и агро',
    skills: [
      { code: 'logistics', name: 'Логистика' },
      { code: 'supply_chain', name: 'Закупки и снабжение' },
      { code: 'warehouse', name: 'Складской учёт' },
      { code: 'agronomy', name: 'Агрономия' },
    ],
  },
  {
    group: 'Языки',
    skills: [
      { code: 'english_b1', name: 'Английский B1' },
      { code: 'english_b2', name: 'Английский B2 и выше' },
      { code: 'german', name: 'Немецкий' },
      { code: 'chinese', name: 'Китайский' },
    ],
  },
  {
    group: 'Общие навыки',
    skills: [
      { code: 'business_writing', name: 'Деловая переписка' },
      { code: 'public_speaking', name: 'Публичные выступления' },
      { code: 'teamwork', name: 'Работа в команде' },
      { code: 'time_management', name: 'Тайм-менеджмент' },
    ],
  },
];

export interface SkillRow {
  code: string;
  name: string;
  groupName: string;
  sort: number;
}

/**
 * Плоский список для таблицы skills. sort сквозной: номер группы × 100 + позиция в группе × 5, —
 * по нему одному идут и группы в заданном порядке, и навыки внутри группы (до 19 навыков в группе).
 */
export function skillRows(groups: readonly SkillGroupSeed[] = SKILL_GROUPS): SkillRow[] {
  return groups.flatMap(({ group, skills }, g) =>
    skills.map((s, i) => ({ code: s.code, name: s.name, groupName: group, sort: (g + 1) * 100 + (i + 1) * 5 })),
  );
}

type Query = (sql: string, params?: unknown[]) => Promise<unknown>;

/**
 * Загружает справочник одним запросом. Идемпотентно: существующий код обновляет название, группу и порядок.
 * Справочник — не тестовые данные, он нужен и в проде, поэтому грузится при каждом старте.
 */
export async function seedSkills(db: { query: Query }, rows: readonly SkillRow[] = skillRows()): Promise<number> {
  if (rows.length === 0) return 0;
  const values = rows.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ');
  await db.query(
    `INSERT INTO skills (code, name, group_name, sort) VALUES ${values}
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, group_name = EXCLUDED.group_name, sort = EXCLUDED.sort`,
    rows.flatMap((r) => [r.code, r.name, r.groupName, r.sort]),
  );
  return rows.length;
}
