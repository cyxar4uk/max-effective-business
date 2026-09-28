import { z } from 'zod';

const text = (max: number) => z.string({ error: 'Обязательное поле' }).trim().min(1, 'Обязательное поле').max(max, `Не длиннее ${max} символов`);
const format = z.enum(['office', 'remote', 'hybrid'], { error: 'Выберите формат: office, remote или hybrid' });
const skillList = (max: number) => z.array(z.string().min(1), { error: 'Нужен список навыков' }).max(max, `Не больше ${max} навыков`);
const date = z.iso.date({ error: 'Дата в формате ГГГГ-ММ-ДД' });
const placeType = z.enum(['practice', 'internship', 'part_time'], { error: 'Выберите тип: practice, internship или part_time' });
const paid = z.boolean({ error: 'Укажите, оплачивается ли место' });
// Сумма по желанию, ₽ в месяц
const salary = z.number({ error: 'Сумма — целое число рублей' }).int('Сумма — целое число рублей').min(1, 'Сумма больше нуля').max(10_000_000, 'Слишком большая сумма');
const tagList = z.array(z.string().min(1), { error: 'Нужен список тегов' }).max(3, 'Не больше 3 тегов').transform((v) => [...new Set(v)]);
const practiceMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Месяц в формате ГГГГ-ММ');

export const phoneBody = z.object({
  phone: z.string().regex(/^\+?\d{10,15}$/, 'Номер в формате +79990000000'),
  authDate: z.union([z.string(), z.number()]).transform(String),
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
  practiceMonth: practiceMonth.nullish().transform((v) => v ?? null),
});

export const employerProfileBody = z.object({
  companyName: text(200),
  city: text(100),
  contactName: text(200),
});

// Обязательные поля публикации места (decisions.md, 27.09): тип, задача (title), ≥ 1 обязательный навык, формат,
// город для очного и гибридного, сроки «с — по», оплата, число мест. Описание, сумма и теги — по желанию.
const internshipFields = {
  type: placeType,
  title: text(200),
  description: z.string().trim().max(4000, 'Не длиннее 4000 символов').default(''),
  requiredSkills: skillList(20).min(1, 'Укажите хотя бы один обязательный навык').transform((v) => [...new Set(v)]),
  niceSkills: skillList(20).default([]).transform((v) => [...new Set(v)]),
  tags: tagList.default([]),
  format,
  city: text(100).nullish().transform((v) => v ?? null),
  startsOn: date,
  endsOn: date,
  paid,
  salary: salary.nullish().transform((v) => v ?? null),
  slots: z.number({ error: 'Число мест — целое от 1 до 100' }).int().min(1, 'Хотя бы одно место').max(100, 'Не больше 100 мест'),
};

// Проверки, которые касаются нескольких полей: и для создания, и для итогового состояния после PATCH
export function internshipRules(v: {
  format: string;
  city: string | null;
  startsOn: string | null;
  endsOn: string | null;
  requiredSkills: string[];
  niceSkills: string[];
  paid: boolean | null;
  salary: number | null;
}): Record<string, string> {
  const fields: Record<string, string> = {};
  if (v.format !== 'remote' && !v.city) fields.city = 'Для очного и гибридного формата укажите город';
  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) fields.endsOn = 'Дата окончания раньше даты начала';
  if (v.niceSkills.some((s) => v.requiredSkills.includes(s))) fields.niceSkills = 'Навык уже есть среди обязательных';
  if (v.salary !== null && v.paid !== true) fields.salary = 'Сумму можно указать только у оплачиваемого места';
  return fields;
}

export const internshipBody = z.object(internshipFields);

export const internshipPatch = z
  .object({
    type: placeType,
    title: internshipFields.title,
    description: z.string().trim().max(4000, 'Не длиннее 4000 символов'),
    requiredSkills: skillList(20).min(1, 'Укажите хотя бы один обязательный навык').transform((v) => [...new Set(v)]),
    niceSkills: skillList(20).transform((v) => [...new Set(v)]),
    tags: tagList,
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
    .string()
    .optional()
    .transform((v) => (v ? [...new Set(v.split(',').map((t) => t.trim()).filter(Boolean))] : [])),
});

export const interestBody = z.object({
  action: z.enum(['interested', 'skipped'], { error: 'action: interested или skipped' }),
});

export const idParam = z.coerce.number({ error: 'Некорректный id' }).int().positive('Некорректный id');
