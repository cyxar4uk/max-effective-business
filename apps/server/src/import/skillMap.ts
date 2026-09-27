// Навыки в вакансиях «Работа России» — свободный текст в названии, навыках, требованиях и обязанностях,
// а совпадение считается только по кодам справочника. Здесь — какие слова каким кодам соответствуют.
// В JS \w не ловит кириллицу, поэтому окончания — [а-яёa-z]*.
// Личные качества («работа в команде», «ответственность») не сопоставляем: они есть почти в каждой вакансии
// и дали бы ложное совпадение.
import { skillRows } from '../seed/skills.js';

const RULES: [code: string, pattern: RegExp][] = [
  ['excel', /excel|эксель/i],
  ['google_sheets', /google\s*(таблиц|sheets)/i],
  ['sql', /(^|[^a-z])sql([^a-z]|$)/i],
  ['power_bi', /power\s*bi/i],
  ['python', /python/i],
  ['statistics', /статистик/i],
  ['data_visualization', /визуализац/i],
  ['market_research', /(исследовани|анализ)[а-яёa-z]*\s+рынка|маркетингов[а-яёa-z]*\s+исследован/i],
  ['marketplace_cards', /маркетплейс/i],
  ['wildberries', /wildberries|вайлдберриз/i],
  ['ozon', /(^|[^a-z])ozon([^a-z]|$)|озон/i],
  ['unit_economics', /юнит.?экономик/i],
  ['avito', /авито|avito/i],
  ['financial_analysis', /финансов[а-яёa-z]*\s+анализ/i],
  ['budgeting', /бюджетир/i],
  ['accounting', /бухгалтер|первичн[а-яёa-z]*\s+документ/i],
  ['1c_trade', /1[сc]\s*:?\s*(управление торговлей|ут|торговл)/i],
  ['1c_zup', /1[сc]\s*:?\s*(зуп|зарплата)/i],
  ['1c_programming', /программирова[а-яёa-z]*\s+(в|на)\s+1[сc]|1[сc]\s*:?\s*программ/i],
  ['1c_accounting', /1[сc]\s*:?\s*(бухгалтер|предприяти)|(^|[^\wа-яё])1[сc]([^\wа-яё]|$)/i],
  ['tax_accounting', /налогов[а-яёa-z]*\s+(учет|учёт|отчетн|отчётн)/i],
  ['smm', /smm|социальн[а-яёa-z]*\s+сет|соцсет/i],
  ['copywriting', /копирайт|написани[а-яёa-z]*\s+текст/i],
  ['content_marketing', /контент.?маркетинг/i],
  ['targeted_ads', /таргет/i],
  ['context_ads', /контекстн[а-яёa-z]*\s+реклам|яндекс\.?\s*директ|yandex\.?\s*direct/i],
  ['seo', /(^|[^a-z])seo([^a-z]|$)/i],
  ['web_analytics', /яндекс\.?\s*метрик|веб.?аналитик|google analytics/i],
  ['email_marketing', /e-?mail.?(рассыл|маркетинг)|рассылк/i],
  ['pr', /(^|[^a-zа-яё])pr([^a-zа-яё]|$)|связ[а-яёa-z]*\s+с\s+общественност/i],
  ['event_management', /организаци[а-яёa-z]*\s+мероприяти|ивент/i],
  ['sales', /продаж/i],
  ['b2b_sales', /b2b/i],
  ['crm', /(^|[^a-z])crm([^a-z]|$)|битрикс|amocrm/i],
  ['customer_support', /работ[а-яёa-z]*\s+с\s+клиент|клиентск[а-яёa-z]*\s+(сервис|поддерж|обслуж)|обслуживани[а-яёa-z]*\s+клиент/i],
  ['negotiations', /переговор/i],
  ['contract_law', /договорн[а-яёa-z]*\s+работ|составлени[а-яёa-z]*\s+договор/i],
  ['civil_law', /гражданск[а-яёa-z]*\s+прав/i],
  ['labor_law', /трудов[а-яёa-z]*\s+(прав|законодат)/i],
  ['consultant_plus', /консультант\s*плюс|гарант\s*(плюс|эксперт|систем)|справочно.?правов/i],
  ['public_procurement', /44-?фз|223-?фз|госзакуп|государственн[а-яёa-z]*\s+закуп/i],
  ['project_management', /управлени[а-яёa-z]*\s+проект/i],
  ['records_management', /делопроизводств|документооборот/i],
  ['hr_admin', /кадров[а-яёa-z]*\s+(учет|учёт|делопроизводств|документ)/i],
  ['recruiting', /подбор[а-яёa-z]*\s+персонал|рекрут|поиск[а-яёa-z]*\s+кандидат/i],
  ['html_css', /html|css/i],
  ['javascript', /javascript|(^|[^a-z])js([^a-z]|$)/i],
  ['react', /react/i],
  ['nodejs', /node\.?js/i],
  ['git', /(^|[^a-z])git([^a-z]|$)/i],
  ['qa_testing', /тестировани[а-яёa-z]*\s+(по|программ|приложен)|(^|[^a-z])qa([^a-z]|$)/i],
  ['no_code', /tilda|тильд[аеы]|конструктор[а-яёa-z]*\s+сайт/i],
  ['wordpress', /wordpress/i],
  ['chatbots', /чат.?бот/i],
  ['figma', /figma|фигм/i],
  ['ui_ux', /(^|[^a-z])(ui|ux)([^a-z]|$)/i],
  ['graphic_design', /графическ[а-яёa-z]*\s+дизайн/i],
  ['photoshop', /photoshop|фотошоп/i],
  ['canva', /canva/i],
  ['video_editing', /видеомонтаж|монтаж[а-яёa-z]*\s+видео/i],
  ['product_photo', /предметн[а-яёa-z]*\s+(съемк|съёмк|фото)/i],
  ['presentations', /презентац/i],
  ['logistics', /логистик/i],
  ['supply_chain', /снабжени|закупк/i],
  ['warehouse', /складск/i],
  ['agronomy', /агроном/i],
  ['english_b2', /английск[а-яёa-z]*.{0,20}(b2|c1|свободн|upper)/i],
  ['english_b1', /английск/i],
  ['german', /немецк/i],
  ['chinese', /китайск/i],
  ['business_writing', /делов[а-яёa-z]*\s+(переписк|письм)/i],
];

/** Коды, которые сейчас есть в справочнике: словарь может знать навыки, которые справочник ещё не добавил. */
const KNOWN = new Set(skillRows().map((r) => r.code));

/** Сопоставляет свободный текст вакансии с кодами справочника. Порядок — как в правилах, без повторов, только известные коды. */
export function mapSkills(texts: readonly string[]): string[] {
  const joined = texts.join('\n');
  const found = RULES.filter(([code, re]) => KNOWN.has(code) && re.test(joined)).map(([code]) => code);
  // Если нашёлся английский B2 и выше, B1 не дублируем
  return found.includes('english_b2') ? found.filter((c) => c !== 'english_b1') : found;
}

export const SKILL_MAP_CODES = RULES.map(([code]) => code);
