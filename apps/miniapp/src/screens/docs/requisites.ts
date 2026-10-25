// Реквизиты компании для документов практики (F-16): поля, проверка, тело PUT /api/employer/profile.
import type { Requisites } from '../../api/types';

export type RequisiteName = keyof Requisites;
export type RequisitesForm = Record<RequisiteName, string>;

interface Field {
  name: RequisiteName;
  label: string;
  placeholder: string;
  /** Нужно, чтобы договор и письмо собрались целиком (таблица в спеке F-16). */
  required: boolean;
  inputMode?: 'numeric' | 'tel' | 'email';
  autoComplete?: string;
}

interface Group {
  title: string;
  fields: Field[];
}

/** Порядок на экране — как в договоре: компания, кто подписывает, кто отвечает за практику. */
export const REQUISITE_GROUPS: Group[] = [
  {
    title: 'Компания',
    fields: [
      { name: 'legalName', label: 'Полное наименование', placeholder: 'Общество с ограниченной ответственностью «Вектор»', required: true, autoComplete: 'organization' },
      { name: 'inn', label: 'ИНН', placeholder: '10 или 12 цифр', required: true, inputMode: 'numeric' },
      { name: 'ogrn', label: 'ОГРН или ОГРНИП', placeholder: '13 или 15 цифр', required: true, inputMode: 'numeric' },
      { name: 'legalAddress', label: 'Юридический адрес', placeholder: '420111, г. Казань, ул. Баумана, д. 1', required: true, autoComplete: 'street-address' },
    ],
  },
  {
    title: 'Кто подписывает',
    fields: [
      { name: 'signerName', label: 'ФИО', placeholder: 'Иванова Анна Сергеевна', required: true },
      { name: 'signerPosition', label: 'Должность', placeholder: 'генеральный директор', required: true },
      { name: 'signerBasis', label: 'Действует на основании', placeholder: 'Устава', required: true },
    ],
  },
  {
    title: 'Ответственный за практику',
    fields: [
      { name: 'responsibleName', label: 'ФИО', placeholder: 'Петров Илья Андреевич', required: true },
      { name: 'responsiblePosition', label: 'Должность', placeholder: 'руководитель отдела продаж', required: true },
      { name: 'responsiblePhone', label: 'Телефон, по желанию', placeholder: '+7 900 000-00-00', required: false, inputMode: 'tel', autoComplete: 'tel' },
      { name: 'responsibleEmail', label: 'Почта, по желанию', placeholder: 'practice@vector.ru', required: false, inputMode: 'email', autoComplete: 'email' },
    ],
  },
];

export const REQUISITE_FIELDS: Field[] = REQUISITE_GROUPS.flatMap((g) => g.fields);

/** Лимит длины — как на сервере (спека F-16). */
export const REQUISITE_MAX = 300;

/** id поля на странице: по нему курсор встаёт в первое поле с ошибкой. */
export const requisiteId = (name: RequisiteName) => `req-${name}`;

export function requisitesForm(source: Requisites | null): RequisitesForm {
  return Object.fromEntries(REQUISITE_FIELDS.map((f) => [f.name, source?.[f.name] ?? ''])) as RequisitesForm;
}

/** Пустое поле уходит как null: реквизиты необязательные. */
export function requisitesBody(form: RequisitesForm): Requisites {
  return Object.fromEntries(REQUISITE_FIELDS.map((f) => [f.name, form[f.name].trim() || null])) as Requisites;
}

/** Ошибки у полей. ИНН — 10 или 12 цифр, ОГРН — 13 или 15; пустое — не ошибка. */
export function checkRequisites(form: RequisitesForm): Record<string, string> {
  const found: Record<string, string> = {};
  const inn = form.inn.trim();
  const ogrn = form.ogrn.trim();
  if (inn && !/^(\d{10}|\d{12})$/.test(inn)) found.inn = 'ИНН — 10 цифр у компании или 12 у ИП';
  if (ogrn && !/^(\d{13}|\d{15})$/.test(ogrn)) found.ogrn = 'ОГРН — 13 цифр у компании, ОГРНИП — 15';
  return found;
}

/** Сколько обязательных для документов полей заполнено. */
export function requisitesFilled(form: RequisitesForm): { done: number; total: number } {
  const req = REQUISITE_FIELDS.filter((f) => f.required);
  return { done: req.filter((f) => form[f.name].trim()).length, total: req.length };
}
