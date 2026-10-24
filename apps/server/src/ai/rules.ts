// Черновик карточки места без модели: по ключевым словам в тексте работодателя. Работает, когда GigaChat не настроен,
// недоступен или ответил не по формату. Логика тегов — как в форме: тег даёт 2 обязательных навыка, остальные его
// навыки — желательные (apps/miniapp/src/screens/employer/formSteps.tsx, withTag).
import type { SkillGroupSeed } from '../seed/skills.js';
import type { TaskTag } from '../seed/tags.js';
import { clip, DRAFT_LIMITS, type DraftCore, type PlaceType, type WorkFormat } from './types.js';

/**
 * Начало слова — обязательно, конец — только у ключей с `$` (короткие: «вб», «вк»). Текст и ключи — в нижнем
 * регистре, «ё» → «е». \b в JS не знает кириллицу, поэтому границы — через \p{L}\p{N}.
 */
type Keys = Record<string, readonly string[]>;

/** Ключевые слова → навык. Порядок навыков в черновике — по первому упоминанию в тексте. */
const SKILL_KEYS: Keys = {
  smm: ['соцсет', 'инст$', 'инсту$', 'инсты$', 'инстаграм', 'instagram', 'insta', 'вконтакт', 'вк$', 'vk$', 'телеграм', 'smm', 'смм', 'паблик', 'постинг', 'посты$', 'постов$'],
  video_editing: ['сторис', 'stories', 'рилс', 'reels', 'видео', 'монтаж', 'ролик', 'тикток', 'tiktok', 'shorts', 'клип'],
  copywriting: ['текст', 'копирайт', 'статьи', 'статей'],
  targeted_ads: ['таргет', 'реклам'],
  context_ads: ['директ', 'контекстн'],
  canva: ['canva', 'канв'],
  graphic_design: ['дизайн', 'баннер', 'логотип', 'макет', 'инфограф'],
  photoshop: ['photoshop', 'фотошоп'],
  product_photo: ['фото', 'предметн'],
  marketplace_cards: ['карточк', 'маркетплейс'],
  wildberries: ['wildberries', 'вайлдбер', 'валдбер', 'вб$', 'wb$'],
  ozon: ['ozon', 'озон'],
  marketplace_analytics: ['аналитик продаж', 'аналитику продаж'],
  unit_economics: ['юнит', 'unit', 'маржинальн', 'себестоимост'],
  avito: ['авито', 'avito'],
  google_sheets: ['гугл табл', 'google sheets', 'google табл', 'гугл-табл'],
  excel: ['excel', 'эксел', 'экзел'],
  power_bi: ['power bi', 'powerbi'],
  data_visualization: ['дашборд', 'визуализ', 'графики$', 'графиками', 'графиков', 'график продаж'],
  sql: ['sql'],
  python: ['python', 'питон'],
  market_research: ['конкурент', 'исследование рынка', 'анализ рынка'],
  '1c_accounting': ['1с бухгалтер', '1с: бухгалтер', '1c бухгалтер'],
  '1c_trade': ['1с торгов', '1с: торгов', 'управление торговлей'],
  '1c_programming': ['программирование 1с', 'программист 1с', 'доработать 1с', 'доработка 1с'],
  '1c_zup': ['зуп$', 'зарплата и кадры'],
  accounting: ['бухучет', 'бухгалтерск', 'первичк', 'проводк'],
  tax_accounting: ['налог', 'декларац'],
  financial_analysis: ['финанализ', 'финансовый анализ', 'финансов'],
  budgeting: ['бюджет'],
  seo: ['seo', 'сео', 'поисков'],
  web_analytics: ['метрик', 'аналитику сайта'],
  no_code: ['tilda', 'тильд', 'конструктор', 'лендинг'],
  wordpress: ['wordpress', 'вордпресс'],
  html_css: ['html', 'css', 'верст'],
  javascript: ['javascript', 'js$'],
  chatbots: ['чат-бот', 'чатбот', 'бот$', 'бота$'],
  sales: ['продаж', 'продава', 'обзвон', 'холодн'],
  b2b_sales: ['b2b', 'оптов'],
  crm: ['crm', 'срм', 'амо', 'amocrm', 'битрикс'],
  customer_support: ['поддержк', 'консультир', 'отвечать клиент', 'отвечать покупател', 'отвечать на вопрос', 'входящ'],
  negotiations: ['переговор'],
  reviews_management: ['отзыв'],
  email_marketing: ['рассылк', 'email'],
  event_management: ['мероприят', 'ивент', 'праздник'],
  pr: ['сми$', 'пресс-релиз', 'журналист'],
  presentations: ['презентац'],
  figma: ['figma', 'фигм'],
  ui_ux: ['ux', 'интерфейс'],
  recruiting: ['подбор персонал', 'найм', 'собеседован', 'вакансии'],
  hr_admin: ['кадров', 'отдел кадров'],
  training: ['обучение сотрудник', 'обучать сотрудник', 'обучение персонал'],
  logistics: ['логист', 'доставк'],
  warehouse: ['склад', 'остатк', 'инвентаризац'],
  supply_chain: ['закупк', 'поставщик', 'снабжен'],
  contract_law: ['договорн', 'составлять договор', 'проверять договор', 'составить договор', 'проверить договор'],
  public_procurement: ['госзакуп', 'тендер', '44-фз', '223-фз'],
  business_processes: ['регламент', 'бизнес-процесс'],
  english_b1: ['английск', 'english'],
  chinese: ['китайск'],
  business_writing: ['переписк', 'письма'],
};

/** Общие слова направления, которые сами по себе навыка не дают. */
const TAG_KEYS: Keys = {
  website: ['сайт', 'лендинг', 'интернет-магазин'],
  marketplaces: ['маркетплейс', 'артикул', 'селлер'],
  one_c: ['1с$', '1c$', '1с:'],
  social_ads: ['соцсет', 'контент', 'блог', 'подписчик', 'продвиж'],
  spreadsheets: ['таблиц', 'отчет', 'аналитик', 'учет', 'свод'],
  sales: ['клиент', 'покупател', 'заявк', 'лиды$', 'лидов$'],
};

const TYPE_KEYS: Record<PlaceType, readonly string[]> = {
  part_time: ['подработ', 'разов', 'на пару часов', 'неполный день'],
  internship: ['стажир', 'стажер', 'взять в штат', 'в штат'],
  practice: ['практика$', 'практику$', 'практикант', 'на практику', 'производственн', 'преддипломн'],
};

const FORMAT_KEYS: Record<WorkFormat, readonly string[]> = {
  remote: ['удаленн', 'удаленк', 'дистанцион', 'из дома', 'онлайн-формат', 'remote'],
  hybrid: ['гибрид'],
  office: ['в офисе', 'офис', 'очно', 'приходить', 'на месте'],
};

export function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е');
}

const compiled = new Map<string, RegExp>();

function keyRegex(key: string): RegExp {
  const cached = compiled.get(key);
  if (cached) return cached;
  const end = key.endsWith('$');
  const body = (end ? key.slice(0, -1) : key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${body}${end ? '(?![\\p{L}\\p{N}])' : ''}`, 'u');
  compiled.set(key, re);
  return re;
}

/** Позиция первого ключа в тексте или -1. */
function firstHit(text: string, keys: readonly string[]): number {
  let best = -1;
  for (const k of keys) {
    const m = keyRegex(k).exec(text);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

const hits = (text: string, keys: readonly string[]) => keys.filter((k) => keyRegex(k).test(text)).length;

// «…нужно / надо / хотим …» — с этого места начинается сама задача
const LEAD =
  /(?:^|[\s,;:—–-])(?:срочно\s+)?(нужен|нужна|нужно|нужны|ищем|ищу|требуется|требуются|хотим|хочу|хочется|хотелось бы|надо|необходимо|необходим|необходима)\s+/iu;
// «…человека, который будет…» после «нужен» — в любом падеже, только целым словом
const NOT_LETTER = '(?![\\p{L}\\p{N}])';
const PUNCT = '[\\s,:;—–-]*';
const WHO_NOUN = new RegExp(
  `^${PUNCT}(?:человек\\p{L}*|студент\\p{L}*|помощни\\p{L}*|специалист\\p{L}*|сотрудни\\p{L}*|девушк\\p{L}*|парень|парня|кто-то|кто-нибудь)${NOT_LETTER}`,
  'iu',
);
const WHO_CLAUSE = new RegExp(
  `^${PUNCT}(?:(?:котор\\p{L}*|кто|чтобы|что бы)${NOT_LETTER}\\s*)?(?:(будет|будут|бы|сможет|смогут|умеет|мог|могла|поможет|помогал\\p{L}*|помогать)${NOT_LETTER}\\s*)?`,
  'iu',
);
const PREPOSITION = /^(?:по|с|со|на|в|во|для|из|к|от|за)$/iu;
const WANT = /^(?:хотим|хочу|хочется|хотелось бы)$/iu;
const INFINITIVE = /(?:ть|ти|чь|ться|тись)$/u;
/** Длинное предложение обрезаем по последней запятой до этой длины. */
const TITLE_SOFT = 100;

/** Текст после «нужен / ищем…»: без «человека, который будет…»; «специалист по 1С» — как есть. */
function taskAfterLead(afterLead: string, lead: string): string {
  const noun = WHO_NOUN.exec(afterLead);
  let rest = noun ? afterLead.slice(noun[0].length) : afterLead;
  const clause = WHO_CLAUSE.exec(rest);
  const helper = clause?.[1]?.toLowerCase() ?? '';
  rest = rest.slice(clause?.[0].length ?? 0).trim();
  const first = (rest.split(' ')[0] ?? '').toLowerCase();
  // «человека, который поможет с отчётами» → «Помочь с отчётами»
  if (helper.startsWith('помо')) return `помочь ${rest}`;
  // «специалист по 1С» — без существительного остаётся «по 1С»: оставляем как написали
  if (noun && PREPOSITION.test(first)) return afterLead.replace(/^[\s,:;—–-]+/u, '');
  // «хочется таблицу с графиками» → «Сделать таблицу с графиками»
  if (WANT.test(lead) && first && !INFINITIVE.test(first)) return `сделать ${rest}`;
  return rest;
}

/**
 * Заголовок из текста: задача после «нужно / надо / хотим…» в первом предложении, где она есть, без «человек,
 * который будет…», с заглавной буквы. Нет такого предложения — первое осмысленное (от четырёх слов).
 */
export function titleFromText(text: string): string {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s/)
    .map((s) => s.replace(/[.!?…\s]+$/u, '').trim())
    .filter(Boolean);
  let title = '';
  for (const s of sentences) {
    const m = LEAD.exec(s);
    if (!m) continue;
    const rest = taskAfterLead(s.slice(m.index + m[0].length), m[1] ?? '').trim();
    if (rest.split(' ').length >= 2) {
      title = rest;
      break;
    }
  }
  if (!title) title = sentences.find((s) => s.split(' ').length >= 4) ?? sentences[0] ?? '';
  if (title.length > TITLE_SOFT) {
    const comma = title.lastIndexOf(', ', TITLE_SOFT);
    if (comma > 20) title = title.slice(0, comma);
  }
  title = clip(title.replace(/^[\s,:;—–-]+/u, ''), DRAFT_LIMITS.title);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function rulesDraft(text: string, groups: readonly SkillGroupSeed[], tags: readonly TaskTag[]): DraftCore {
  const t = normalize(text);
  const known = new Set(groups.flatMap((g) => g.skills.map((s) => s.code)));

  const mentioned = Object.entries(SKILL_KEYS)
    .filter(([code]) => known.has(code))
    .map(([code, keys]) => ({ code, at: firstHit(t, keys) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.code);

  // Тег — самое заметное направление: его общие слова плюс названные навыки из него
  const top = tags
    .map((tag, order) => ({
      tag,
      order,
      score: hits(t, TAG_KEYS[tag.code] ?? []) + tag.skills.filter((s) => mentioned.includes(s)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)[0]?.tag;

  const tagSkills = top ? top.skills.filter((s) => known.has(s)) : [];
  // Обязательные — названные навыки из направления (не больше трёх): «сводим продажи в таблицу» — это про таблицы,
  // а не про продажи. Из направления ничего не названо — названные вне его. Меньше двух — добираем первыми навыками
  // направления, как форма при выборе тега. Остальное названное — в желательные.
  const inTag = mentioned.filter((s) => tagSkills.includes(s));
  const required = (inTag.length ? inTag : mentioned).slice(0, 3);
  for (const s of tagSkills) {
    if (required.length >= 2) break;
    if (!required.includes(s)) required.push(s);
  }
  const niceSkills = [...new Set([...mentioned, ...tagSkills])].filter((s) => !required.includes(s)).slice(0, DRAFT_LIMITS.nice);

  return {
    title: titleFromText(text),
    tags: top ? [top.code] : [],
    requiredSkills: required,
    niceSkills,
    type: pick(t, TYPE_KEYS),
    format: pick(t, FORMAT_KEYS),
  };
}

function pick<T extends string>(text: string, keys: Record<T, readonly string[]>): T | null {
  let best: { value: T; at: number } | null = null;
  for (const [value, list] of Object.entries(keys) as [T, readonly string[]][]) {
    const at = firstHit(text, list);
    if (at >= 0 && (!best || at < best.at)) best = { value, at };
  }
  return best?.value ?? null;
}
