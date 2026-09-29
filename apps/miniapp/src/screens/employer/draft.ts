// Черновик формы места: данные, проверки по шагам (как на сервере, docs/api.md «Место»), хранение в localStorage.
import type {
  InternshipInput,
  InternshipType,
  SkillCode,
  SkillGroup,
  Tag,
  TagCode,
  WorkFormat,
} from '../../api/types';

export interface Draft {
  title: string;
  tags: TagCode[];
  type: InternshipType | null;
  requiredSkills: SkillCode[];
  niceSkills: SkillCode[];
  format: WorkFormat | null;
  /** null — город из профиля компании (значение по умолчанию). */
  city: string | null;
  startsOn: string;
  endsOn: string;
  paid: boolean | null;
  /** Сумма в месяц, только цифры; пусто — не указана. */
  salary: string;
  slots: number;
  description: string;
}

export const EMPTY_DRAFT: Draft = {
  title: '',
  tags: [],
  type: null,
  requiredSkills: [],
  niceSkills: [],
  format: null,
  city: null,
  startsOn: '',
  endsOn: '',
  paid: null,
  salary: '',
  slots: 1,
  description: '',
};

export const LIMITS = {
  title: 200,
  description: 4000,
  city: 100,
  skills: 20,
  tags: 3,
  salaryMax: 10_000_000,
  slotsMax: 100,
} as const;

export type Errors = Record<string, string>;

/** Справочники и профиль компании — всё, что форма берёт с сервера. */
export interface Dict {
  groups: SkillGroup[];
  skillName: Map<SkillCode, string>;
  tags: Tag[];
  companyName: string;
  defaultCity: string;
}

interface StepMeta {
  /** Крупный вопрос на телефоне. */
  question: string;
  sub?: string;
  /** Подпись блока на десктопе. */
  label: string;
  /** Строка на экране проверки. */
  edit: string;
}

export const STEPS: readonly StepMeta[] = [
  { question: 'Что нужно сделать?', label: 'Задача для студента', edit: 'Задача и теги' },
  { question: 'Какое это место?', label: 'Тип места', edit: 'Тип места' },
  {
    question: 'Какие навыки нужны?',
    sub: 'Обязательные весят 70 % совпадения, желательные — 30 %.',
    label: 'Навыки',
    edit: 'Навыки',
  },
  { question: 'Где работать?', label: 'Формат и город', edit: 'Формат и город' },
  { question: 'На какие даты?', label: 'Сроки', edit: 'Сроки' },
  { question: 'Работа оплачивается?', sub: 'Это первое, о чём спрашивают студенты.', label: 'Оплата', edit: 'Оплата' },
  { question: 'Сколько человек нужно?', label: 'Сколько человек', edit: 'Число мест' },
  {
    question: 'Что ещё рассказать?',
    sub: 'По желанию: подробности задачи, чему научится студент, как устроена работа.',
    label: 'Описание — по желанию',
    edit: 'Описание',
  },
];

export const STEP_COUNT = STEPS.length;
/** Экран «Проверьте карточку» — следующий после последнего шага. */
export const REVIEW_STEP = STEP_COUNT;

/** Поле API → номер шага: туда ведём при ошибке сервера. */
const FIELD_STEP: Record<string, number> = {
  title: 0,
  tags: 0,
  type: 1,
  requiredSkills: 2,
  niceSkills: 2,
  format: 3,
  city: 3,
  startsOn: 4,
  endsOn: 4,
  paid: 5,
  salary: 5,
  slots: 6,
  description: 7,
};

/** Какие ошибки снимать при правке поля: поле и связанные с ним правила. */
export const RELATED: Partial<Record<keyof Draft, string[]>> = {
  format: ['format', 'city'],
  startsOn: ['startsOn', 'endsOn'],
  endsOn: ['startsOn', 'endsOn'],
  paid: ['paid', 'salary'],
  requiredSkills: ['requiredSkills', 'niceSkills'],
  niceSkills: ['requiredSkills', 'niceSkills'],
};

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

export const cityOf = (d: Draft, defaultCity: string): string => (d.city ?? defaultCity).trim();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE_RE.test(s) && s >= '2000-01-01' && s <= '2100-12-31';

export function validateStep(step: number, d: Draft, defaultCity: string): Errors {
  const e: Errors = {};
  switch (step) {
    case 0:
      if (!d.title.trim()) e.title = 'Опишите задачу — это заголовок карточки';
      else if (d.title.trim().length > LIMITS.title) e.title = `Не длиннее ${LIMITS.title} символов`;
      if (d.tags.length > LIMITS.tags) e.tags = `Не больше ${LIMITS.tags} тегов`;
      break;
    case 1:
      if (!d.type) e.type = 'Выберите тип места';
      break;
    case 2:
      if (d.requiredSkills.length === 0) e.requiredSkills = 'Добавьте хотя бы один обязательный навык';
      else if (d.requiredSkills.length > LIMITS.skills) e.requiredSkills = `Не больше ${LIMITS.skills} навыков`;
      if (d.niceSkills.length > LIMITS.skills) e.niceSkills = `Не больше ${LIMITS.skills} навыков`;
      else if (d.niceSkills.some((s) => d.requiredSkills.includes(s))) e.niceSkills = 'Навык уже есть среди обязательных';
      break;
    case 3: {
      const city = cityOf(d, defaultCity);
      if (!d.format) e.format = 'Выберите формат работы';
      if (d.format !== 'remote' && !city) e.city = 'Укажите город — для офиса и гибрида он обязателен';
      else if (city.length > LIMITS.city) e.city = `Не длиннее ${LIMITS.city} символов`;
      break;
    }
    case 4:
      if (!d.startsOn) e.startsOn = 'Укажите дату начала';
      else if (!validDate(d.startsOn)) e.startsOn = 'Проверьте дату';
      if (!d.endsOn) e.endsOn = 'Укажите дату окончания';
      else if (!validDate(d.endsOn)) e.endsOn = 'Проверьте дату';
      else if (d.startsOn && d.endsOn < d.startsOn) e.endsOn = 'Окончание не может быть раньше начала';
      break;
    case 5:
      if (d.paid === null) e.paid = 'Укажите, оплачивается ли работа';
      else if (d.paid && d.salary) {
        const n = Number(d.salary);
        if (!Number.isInteger(n) || n < 1 || n > LIMITS.salaryMax) e.salary = 'Сумма — от 1 до 10 000 000 ₽';
      }
      break;
    case 6:
      if (!Number.isInteger(d.slots) || d.slots < 1 || d.slots > LIMITS.slotsMax) e.slots = 'От 1 до 100 мест';
      break;
    case 7:
      if (d.description.trim().length > LIMITS.description) e.description = `Не длиннее ${LIMITS.description} символов`;
      break;
  }
  return e;
}

export function validateAll(d: Draft, defaultCity: string): Errors {
  return Object.assign({}, ...STEPS.map((_, i) => validateStep(i, d, defaultCity))) as Errors;
}

/** Первый шаг, на котором есть ошибка; null — ошибок по шагам нет. */
export function firstErrorStep(errors: Errors): number | null {
  const steps = Object.keys(errors)
    .map((k) => FIELD_STEP[k])
    .filter((s): s is number => s !== undefined);
  return steps.length ? Math.min(...steps) : null;
}

/** Первая ошибка среди полей шага. */
export function errorOnStep(errors: Errors, step: number): string | undefined {
  return Object.entries(errors).find(([k]) => FIELD_STEP[k] === step)?.[1];
}

/** Ошибки без полей этого шага: шаг прошёл проверку — старые ответы сервера по нему больше не показываем. */
export function withoutStep(errors: Errors, step: number): Errors {
  return Object.fromEntries(Object.entries(errors).filter(([k]) => FIELD_STEP[k] !== step));
}

/** Ошибки сервера по полям: `requiredSkills.2` → `requiredSkills`; поля вне формы — отдельно. */
export function splitServerFields(fields: Record<string, string>): { byField: Errors; other: string[] } {
  const byField: Errors = {};
  const other: string[] = [];
  for (const [key, msg] of Object.entries(fields)) {
    const name = key.split('.')[0];
    if (name in FIELD_STEP) byField[name] ??= msg;
    else other.push(msg);
  }
  return { byField, other };
}

/** Тело POST /api/internships. Перед вызовом — validateAll. */
export function toInput(d: Draft, defaultCity: string): InternshipInput {
  const city = cityOf(d, defaultCity);
  const description = d.description.trim();
  return {
    type: d.type as InternshipType,
    title: d.title.trim(),
    description: description || null,
    requiredSkills: d.requiredSkills,
    niceSkills: d.niceSkills,
    tags: d.tags,
    format: d.format as WorkFormat,
    // На удалёнке город по умолчанию не подставляем — только если его ввели сами
    city: d.format === 'remote' ? (d.city?.trim() || null) : city,
    startsOn: d.startsOn,
    endsOn: d.endsOn,
    paid: d.paid as boolean,
    salary: d.paid && d.salary ? Number(d.salary) : null,
    slots: d.slots,
  };
}

/** Навыки и теги, которых нет в справочнике, из черновика убираем: иначе сервер отклонит публикацию. */
export function sanitize(d: Draft, dict: Dict): Draft {
  const known = (s: string) => dict.skillName.has(s);
  const tagCodes = new Set(dict.tags.map((t) => t.code));
  const requiredSkills = d.requiredSkills.filter(known).slice(0, LIMITS.skills);
  return {
    ...d,
    requiredSkills,
    niceSkills: d.niceSkills.filter((s) => known(s) && !requiredSkills.includes(s)).slice(0, LIMITS.skills),
    tags: d.tags.filter((t) => tagCodes.has(t)).slice(0, LIMITS.tags),
  };
}

// ---------- хранение ----------

const storageKey = (userId: number) => `tandem.employer.placeDraft.v1.${userId}`;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null =>
  list.includes(v as T) ? (v as T) : null;

/** Разбор сохранённого черновика: всё, что не похоже на поле формы, заменяем значением по умолчанию. */
function parseDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const slots = typeof o.slots === 'number' && Number.isInteger(o.slots) ? o.slots : 1;
  return {
    title: str(o.title).slice(0, LIMITS.title),
    tags: strList(o.tags),
    type: oneOf(o.type, ['practice', 'internship', 'part_time'] as const),
    requiredSkills: strList(o.requiredSkills),
    niceSkills: strList(o.niceSkills),
    format: oneOf(o.format, ['office', 'hybrid', 'remote'] as const),
    city: typeof o.city === 'string' ? o.city.slice(0, LIMITS.city) : null,
    startsOn: DATE_RE.test(str(o.startsOn)) ? str(o.startsOn) : '',
    endsOn: DATE_RE.test(str(o.endsOn)) ? str(o.endsOn) : '',
    paid: typeof o.paid === 'boolean' ? o.paid : null,
    salary: str(o.salary).replace(/\D/g, '').slice(0, 8),
    slots: Math.min(Math.max(slots, 1), LIMITS.slotsMax),
    description: str(o.description).slice(0, LIMITS.description),
  };
}

/** localStorage может быть недоступен (приватный режим, запрет в webview) — тогда форма работает без черновика. */
export const draftStorage = {
  load(userId: number): Draft | null {
    try {
      const raw = window.localStorage.getItem(storageKey(userId));
      return raw ? parseDraft(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },
  /** true — черновик сохранён. */
  save(userId: number, d: Draft): boolean {
    try {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(d));
      return true;
    } catch {
      return false;
    }
  },
  clear(userId: number): void {
    try {
      window.localStorage.removeItem(storageKey(userId));
    } catch {
      // нечего чистить
    }
  },
};

// ---------- форматирование для карточки ----------

/** Как в ленте студента (screens/student/place.ts). */
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'нояб', 'дек'];

/** '2026-10-15' → '15 окт'. */
export function shortDate(iso: string): string {
  if (!DATE_RE.test(iso)) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''}`.trim();
}

export function plural(n: number, forms: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}

export const rub = (digits: string): string => `${Number(digits).toLocaleString('ru-RU')} ₽`;

export const slotsText = (n: number) => `${n} ${plural(n, ['место', 'места', 'мест'])}`;
