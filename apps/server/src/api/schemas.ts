import { z } from 'zod';

const text = (max: number) => z.string({ error: 'Обязательное поле' }).trim().min(1, 'Обязательное поле').max(max, `Не длиннее ${max} символов`);
const format = z.enum(['office', 'remote', 'hybrid'], { error: 'Выберите формат: office, remote или hybrid' });
const skillList = (max: number) => z.array(z.string().min(1), { error: 'Нужен список навыков' }).max(max, `Не больше ${max} навыков`);
const date = z.iso.date({ error: 'Дата в формате ГГГГ-ММ-ДД' });

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
  skills: skillList(30).transform((v) => [...new Set(v)]),
});

export const employerProfileBody = z.object({
  companyName: text(200),
  city: text(100),
  contactName: text(200),
});

const internshipFields = {
  title: text(200),
  description: z.string().trim().max(4000, 'Не длиннее 4000 символов').default(''),
  requiredSkills: skillList(20).min(1, 'Укажите хотя бы один обязательный навык').transform((v) => [...new Set(v)]),
  niceSkills: skillList(20).default([]).transform((v) => [...new Set(v)]),
  format,
  city: text(100).nullish().transform((v) => v ?? null),
  startsOn: date.nullish().transform((v) => v ?? null),
  endsOn: date.nullish().transform((v) => v ?? null),
  slots: z.number({ error: 'Число мест — целое от 1 до 100' }).int().min(1).max(100).default(1),
};

// Проверки, которые касаются нескольких полей: и для создания, и для итогового состояния после PATCH
export function internshipRules(v: { format: string; city: string | null; startsOn: string | null; endsOn: string | null; requiredSkills: string[]; niceSkills: string[] }): Record<string, string> {
  const fields: Record<string, string> = {};
  if (v.format !== 'remote' && !v.city) fields.city = 'Для очного и гибридного формата укажите город';
  if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) fields.endsOn = 'Дата окончания раньше даты начала';
  if (v.niceSkills.some((s) => v.requiredSkills.includes(s))) fields.niceSkills = 'Навык уже есть среди обязательных';
  return fields;
}

export const internshipBody = z.object(internshipFields);

export const internshipPatch = z
  .object({
    title: internshipFields.title,
    description: z.string().trim().max(4000, 'Не длиннее 4000 символов'),
    requiredSkills: skillList(20).min(1, 'Укажите хотя бы один обязательный навык').transform((v) => [...new Set(v)]),
    niceSkills: skillList(20).transform((v) => [...new Set(v)]),
    format,
    city: internshipFields.city,
    startsOn: internshipFields.startsOn,
    endsOn: internshipFields.endsOn,
    slots: z.number().int().min(1).max(100),
    status: z.enum(['open', 'closed'], { error: 'Статус: open или closed' }),
  })
  .partial();

export const interestBody = z.object({
  action: z.enum(['interested', 'skipped'], { error: 'action: interested или skipped' }),
});

export const idParam = z.coerce.number({ error: 'Некорректный id' }).int().positive('Некорректный id');
