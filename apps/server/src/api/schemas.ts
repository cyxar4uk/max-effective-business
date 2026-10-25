import { z } from 'zod';

// Нулевой байт PostgreSQL в text не принимает — отсекаем на входе, а не получаем 500
const noNul = (s: string) => !s.includes('\u0000');
const NUL_MESSAGE = 'Недопустимый символ';
const text = (max: number) =>
  z.string({ error: 'Обязательное поле' }).trim().min(1, 'Обязательное поле').max(max, `Не длиннее ${max} символов`).refine(noNul, NUL_MESSAGE);
// Код из справочника: короткий и без мусора, чтобы не раздувать ответы с ошибками
const code = z.string({ error: 'Код — строка' }).min(1).max(64, 'Слишком длинный код').refine(noNul, NUL_MESSAGE);
const description = z.string({ error: 'Описание — строка' }).trim().max(4000, 'Не длиннее 4000 символов').refine(noNul, NUL_MESSAGE);
const format = z.enum(['office', 'remote', 'hybrid'], { error: 'Выберите формат: office, remote или hybrid' });
const skillList = (max: number) => z.array(code, { error: 'Нужен список навыков' }).max(max, `Не больше ${max} навыков`);
// z.iso.date пропускает год 0000, который PostgreSQL отвергает; для мест разумен диапазон 2000–2100
const date = z.iso.date({ error: 'Дата в формате ГГГГ-ММ-ДД' }).refine((d) => d >= '2000-01-01' && d <= '2100-12-31', 'Дата вне допустимого диапазона');
const placeType = z.enum(['practice', 'internship', 'part_time'], { error: 'Выберите тип: practice, internship или part_time' });
const paid = z.boolean({ error: 'Укажите, оплачивается ли место' });
// Сумма по желанию, ₽ в месяц
const salary = z.number({ error: 'Сумма — целое число рублей' }).int('Сумма — целое число рублей').min(1, 'Сумма больше нуля').max(10_000_000, 'Слишком большая сумма');
// Сначала убираем дубли, потом проверяем лимит: ['a','a','a','a'] — это один тег
const tagList = z
  .array(code, { error: 'Нужен список тегов' })
  .transform((v) => [...new Set(v)])
  .refine((v) => v.length <= 3, 'Не больше 3 тегов');
// Пустая строка из формы — «не указан»
const practiceMonth = z.preprocess(
  (v) => (v === '' ? null : v),
  z
    .string({ error: 'Месяц в формате ГГГГ-ММ' })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Месяц в формате ГГГГ-ММ')
    .nullish(),
);

export const phoneBody = z.object({
  // Пробелы, скобки и дефисы допускаем («+7 999 000-00-00»): подпись MAX проверяется по номеру как он пришёл,
  // а сохраняется он уже только цифрами (routes.ts) (#102)
  phone: z
    .string()
    .refine((v) => /^\+?\d{10,15}$/.test(v.replace(/[\s()-]/g, '')), 'Номер в формате +79990000000'),
  authDate: z
    .union([z.string(), z.number()], { error: 'Некорректная подпись номера' })
    .transform(String)
    .refine((v) => /^\d{9,13}$/.test(v), 'Некорректная подпись номера'),
  hash: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Некорректная подпись номера'),
});

export const studentProfileBody = z.object({
  university: text(200),
  faculty: text(200).nullish().transform((v) => v ?? null),
  course: z.number({ error: 'Курс — число от 1 до 6' }).int().min(1, 'Курс — от 1 до 6').max(6, 'Курс — от 1 до 6'),
  direction: text(200),
  city: text(100),
  formats: z.array(format).min(1, 'Выберите хотя бы один формат').transform((v) => [...new Set(v)]),
  // Меньше 3 навыков — совпадение неинформативно (decisions.md, 27.09)
  skills: skillList(30)
    .transform((v) => [...new Set(v)])
    .refine((v) => v.length >= 3, 'Выберите хотя бы 3 навыка'),
  practiceMonth: practiceMonth.transform((v) => v ?? null),
});

// Реквизит для документов практики: необязательный. Не передан — undefined (не меняем), "" и null — стираем
const requisite = (max: number) =>
  z
    .string({ error: 'Должно быть строкой' })
    .trim()
    .max(max, `Не длиннее ${max} символов`)
    .refine(noNul, NUL_MESSAGE)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null));
const digits = (lengths: number[], message: string) =>
  requisite(20).refine((v) => !v || (/^\d+$/.test(v) && lengths.includes(v.length)), message);

/** Реквизиты компании для документов практики (F-16), проверка — как в спеке. */
export const requisitesBody = {
  legalName: requisite(300),
  inn: digits([10, 12], 'ИНН — 10 или 12 цифр'),
  ogrn: digits([13, 15], 'ОГРН — 13 или 15 цифр'),
  legalAddress: requisite(300),
  signerName: requisite(300),
  signerPosition: requisite(300),
  signerBasis: requisite(300),
  responsibleName: requisite(300),
  responsiblePosition: requisite(300),
  responsiblePhone: requisite(50),
  responsibleEmail: requisite(200).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Почта в формате name@example.ru'),
};

export const employerProfileBody = z.object({
  companyName: text(200),
  city: text(100),
  contactName: text(200),
  ...requisitesBody,
});

// Обязательные поля публикации места (decisions.md, 27.09): тип, задача (title), ≥ 1 обязательный навык, формат,
// город для очного и гибридного, сроки «с — по», оплата, число мест. Описание, сумма и теги — по желанию.
const internshipFields = {
  type: placeType,
  title: text(200),
  // Необязательные поля: можно не передавать или передать null
  description: description.nullish().transform((v) => v ?? ''),
  requiredSkills: skillList(20).min(1, 'Укажите хотя бы один обязательный навык').transform((v) => [...new Set(v)]),
  niceSkills: skillList(20).nullish().transform((v) => [...new Set(v ?? [])]),
  tags: tagList.nullish().transform((v) => v ?? []),
  format,
  city: text(100).nullish().transform((v) => v ?? null),
  startsOn: date,
  endsOn: date,
  paid,
  salary: salary.nullish().transform((v) => v ?? null),
  slots: z.number({ error: 'Число мест — целое от 1 до 100' }).int().min(1, 'Хотя бы одно место').max(100, 'Не больше 100 мест'),
};

// Проверки, которые касаются нескольких полей: и для создания, и для итогового состояния после PATCH
export function internshipRules(
  v: {
  format: string;
  city: string | null;
  startsOn: string | null;
  endsOn: string | null;
  requiredSkills: string[];
  niceSkills: string[];
  paid: boolean | null;
  salary: number | null;
  },
  // Какие поля пришли в запросе (для PATCH): ошибку по датам кладём в то поле, которое меняли
  sent?: Set<string>,
): Record<string, string> {
  const fields: Record<string, string> = {};
  if (v.format !== 'remote' && !v.city) fields.city = 'Для очного и гибридного формата укажите город';
  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) {
    if (sent && sent.has('startsOn') && !sent.has('endsOn')) fields.startsOn = 'Дата начала позже даты окончания';
    else fields.endsOn = 'Дата окончания раньше даты начала';
  }
  if (v.niceSkills.some((s) => v.requiredSkills.includes(s))) fields.niceSkills = 'Навык уже есть среди обязательных';
  if (v.salary !== null && v.paid !== true) fields.salary = 'Сумму можно указать только у оплачиваемого места';
  return fields;
}

export const internshipBody = z.object(internshipFields);

export const internshipPatch = z
  .object({
    type: placeType,
    title: internshipFields.title,
    description: description.nullable().transform((v) => v ?? ''),
    requiredSkills: skillList(20).min(1, 'Укажите хотя бы один обязательный навык').transform((v) => [...new Set(v)]),
    niceSkills: skillList(20).nullable().transform((v) => [...new Set(v ?? [])]),
    tags: tagList.nullable().transform((v) => v ?? []),
    format,
    city: internshipFields.city,
    startsOn: date,
    endsOn: date,
    paid,
    salary: salary.nullable(),
    slots: z.number().int().min(1, 'Хотя бы одно место').max(100, 'Не больше 100 мест'),
    status: z.enum(['open', 'closed'], { error: 'Статус: open или closed' }),
  })
  .partial();

// Фильтр ленты по тегам: ?tags=website,one_c
export const feedQuery = z.object({
  tags: z
    .union([z.string(), z.array(z.string())], { error: 'Теги через запятую: ?tags=website,one_c' })
    .optional()
    .transform((v) => {
      const parts = (Array.isArray(v) ? v : v ? [v] : []).flatMap((t) => t.split(','));
      return [...new Set(parts.map((t) => t.trim()).filter(Boolean))];
    }),
});

export const interestBody = z.object({
  action: z.enum(['interested', 'skipped'], { error: 'action: interested или skipped' }),
});

export const idParam = z.coerce.number({ error: 'Некорректный id' }).int().positive('Некорректный id');
