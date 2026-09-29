// Подписи и форматирование места для экранов студента. Коды — из docs/api.md.
import type { Internship, InternshipType, Match, Skills, WorkFormat } from '../../api/types';

export const TYPE_LABEL: Record<InternshipType, string> = {
  practice: 'Практика',
  internship: 'Стажировка',
  part_time: 'Подработка',
};

export const FORMAT_LABEL: Record<WorkFormat, string> = {
  office: 'В офисе',
  hybrid: 'Гибрид',
  remote: 'Удалённо',
};

/** Порядок форматов в анкете. */
export const FORMATS: WorkFormat[] = ['office', 'hybrid', 'remote'];

/** Мягкий перенос и неразрывный пробел — кодами, чтобы в исходнике не было невидимых символов. */
const SHY = String.fromCharCode(0xad);
const NBSP = String.fromCharCode(0xa0);

/** Обложка по тегу места: класс фона и надпись (мягкие переносы — чтобы крупный шрифт не вылезал). */
const COVERS: Record<string, { cls: string; label: string }> = {
  marketplaces: { cls: 'cv-market', label: `Маркет${SHY}плейсы` },
  spreadsheets: { cls: 'cv-data', label: 'Таблицы' },
  website: { cls: 'cv-site', label: 'Сайт' },
  one_c: { cls: 'cv-1c', label: '1С' },
  social_ads: { cls: 'cv-social', label: `Соц${SHY}сети` },
  sales: { cls: 'cv-sales', label: 'Продажи' },
};
const COVER_CLASSES = ['cv-market', 'cv-data', 'cv-site', 'cv-1c', 'cv-social', 'cv-sales'];
const TYPE_COVER_LABEL: Record<InternshipType, string> = {
  practice: `Прак${SHY}тика`,
  internship: `Стажи${SHY}ровка`,
  part_time: `Подра${SHY}ботка`,
};

/** Обложка карточки: по первому известному тегу, без тега — по id места. */
export function coverOf(place: Pick<Internship, 'id' | 'tags' | 'type'>): { cls: string; label: string } {
  const byTag = place.tags.map((t) => COVERS[t]).find(Boolean);
  if (byTag) return byTag;
  return { cls: COVER_CLASSES[Math.abs(place.id) % COVER_CLASSES.length], label: TYPE_COVER_LABEL[place.type] ?? '' };
}

/** Цвет точки у чипа тега в фильтре ленты. */
export const TAG_DOT: Record<string, string> = {
  marketplaces: '#ff7a45',
  spreadsheets: '#3d7bff',
  website: '#b15cff',
  one_c: '#ffb020',
  social_ads: '#ff4d6d',
  sales: '#14b8a6',
};

/** Классы обложек по кругу — для цветных пузырей навыков по группам. */
export const coverByIndex = (i: number) => COVER_CLASSES[i % COVER_CLASSES.length];

/** Буква для «логотипа» компании: без ООО/ИП и кавычек. */
export function companyInitial(name: string): string {
  const clean = name
    .replace(/^\s*(ООО|ОАО|ЗАО|ПАО|АО|ИП|НКО|АНО)\s+/i, '')
    .replace(/[«»"'„“”]/g, '')
    .trim();
  return (clean[0] ?? '·').toUpperCase();
}

/** «гибрид, Москва» / «удалённо». */
export function placeWhere(place: Pick<Internship, 'format' | 'city' | 'company'>): string {
  const format = FORMAT_LABEL[place.format]?.toLowerCase() ?? '';
  if (place.format === 'remote') return format;
  const city = place.city ?? place.company.city;
  return city ? `${format}, ${city}` : format;
}

/** «Гибрид, Москва» / «Удалённо» — для плитки условий. */
export function placeFormat(place: Pick<Internship, 'format' | 'city' | 'company'>): string {
  const where = placeWhere(place);
  return where.charAt(0).toUpperCase() + where.slice(1);
}

/** Шаг навыков анкеты с уже отмеченным навыком — ссылка «Есть? Добавить в анкету». */
export const addSkillHref = (code: string) => `/student/profile/edit?step=skills&add=${encodeURIComponent(code)}`;

export function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'нояб', 'дек'];
export const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

/** `2026-10-15` → «15 окт». Разбираем строку сами, без часовых поясов. */
function shortDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1] ?? ''}`.trim();
}

/** Сроки «15 окт — 15 дек»; даты могут быть null. */
export function placeDates(place: Pick<Internship, 'startsOn' | 'endsOn'>): string | null {
  const from = place.startsOn ? shortDate(place.startsOn) : null;
  const to = place.endsOn ? shortDate(place.endsOn) : null;
  if (from && to) return `${from} — ${to}`;
  if (from) return `с ${from}`;
  if (to) return `до ${to}`;
  return null;
}

const rub = new Intl.NumberFormat('ru-RU');

/** Оплата для плитки: сумма, «оплачивается», «без оплаты»; null — не указано. */
export function placePay(place: Pick<Internship, 'paid' | 'salary'>): string | null {
  if (place.paid === true) return place.salary ? `${rub.format(place.salary)} ₽ в месяц` : 'Оплачивается';
  if (place.paid === false) return 'Без оплаты';
  return null;
}

/** Строка фактов под карточкой: сумма · сроки · места. */
export function placeFacts(place: Internship): string {
  const parts: string[] = [];
  if (place.paid === true && place.salary) parts.push(`${rub.format(place.salary)} ₽ в месяц`);
  const dates = placeDates(place);
  if (dates) parts.push(dates);
  if (place.slots > 0) parts.push(`${place.slots} ${plural(place.slots, ['место', 'места', 'мест'])}`);
  return parts.join(' · ');
}

/** Подпись чипа типа: «Практика · оплачивается». */
export function typeChip(place: Pick<Internship, 'type' | 'paid'>): string {
  const type = TYPE_LABEL[place.type] ?? 'Место';
  if (place.paid === true) return `${type} · оплачивается`;
  if (place.paid === false) return `${type} · без оплаты`;
  return type;
}

/** Уровень совпадения для эквалайзера: ≥ 80 — высокий, 60–79 — средний, ниже — низкий. */
export const matchLevel = (score: number): 'hi' | 'md' | 'lo' => (score >= 80 ? 'hi' : score >= 60 ? 'md' : 'lo');

/** «70 % × 2 из 2 обязательных + 30 % × 2 из 3 желательных». Без желательных считаются только обязательные. */
export function matchFormula(match: Match): string[] {
  const mustAll = match.mustMatched.length + match.mustMissing.length;
  const niceAll = match.niceMatched.length + match.niceMissing.length;
  const must = `${match.mustMatched.length} из ${mustAll} ${plural(mustAll, ['обязательного', 'обязательных', 'обязательных'])}`;
  if (niceAll === 0) return [must];
  const nice = `${match.niceMatched.length} из ${niceAll} ${plural(niceAll, ['желательного', 'желательных', 'желательных'])}`;
  return [`70${NBSP}% × ${must}`, `+ 30${NBSP}% × ${nice}`];
}

/** Названия навыков по коду из /api/skills; неизвестный код показываем как есть. */
export type SkillNames = Map<string, string>;

export function skillNames(skills: Skills): SkillNames {
  return new Map(skills.groups.flatMap((g) => g.skills.map((s) => [s.code, s.name] as const)));
}

export const nameOf = (names: SkillNames, code: string) => names.get(code) ?? code;
