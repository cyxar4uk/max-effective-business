// Кандидат глазами компании: имя, аватар, строка о студенте, время отклика. Контракт — docs/api.md «Кандидаты».
import type { Candidate, Internship, InternshipType } from '../../api/types';
import { FORMAT_LABEL, plural } from './draft';

const AVATARS = ['av-a', 'av-b', 'av-c', 'av-d'] as const;

/** Цветная обложка аватара — постоянная для студента. */
export const avatarClass = (studentId: number): string => AVATARS[Math.abs(studentId) % AVATARS.length];

/** Имя; фамилия приходит только после приглашения. */
export const firstName = (c: Pick<Candidate, 'firstName'>): string => c.firstName?.trim() || 'Студент';

export const fullName = (c: Pick<Candidate, 'firstName' | 'lastName'>): string =>
  [firstName(c), c.lastName?.trim()].filter(Boolean).join(' ');

export const initial = (c: Pick<Candidate, 'firstName'>): string => firstName(c).charAt(0).toUpperCase();

/** «3 курс · Бизнес-информатика» — строка в списке. */
export function studyLine(c: Candidate): string {
  return [c.course ? `${c.course} курс` : null, c.direction].filter(Boolean).join(' · ');
}

/** «РАНХиГС · Маркетинг · Москва» — строка на карточке. */
export function aboutLine(c: Candidate): string {
  return [c.university, c.direction, c.city].filter(Boolean).join(' · ');
}

/**
 * Имя в винительном падеже для «Вы пригласили …»: Алиса → Алису, Никита → Никиту, Максим → Максима,
 * Мария → Марию, Андрей → Андрея. Имена не на кириллице и несклоняемые оставляем как есть.
 */
const ACCUSATIVE: Record<string, string> = { Павел: 'Павла', Лев: 'Льва', Пётр: 'Петра', Петр: 'Петра', Любовь: 'Любовь' };

export function accusative(name: string): string {
  if (ACCUSATIVE[name]) return ACCUSATIVE[name];
  if (!/^[А-ЯЁ][а-яё-]+$/.test(name)) return name;
  if (name.endsWith('ия')) return `${name.slice(0, -1)}ю`;
  if (name.endsWith('а')) return `${name.slice(0, -1)}у`;
  if (name.endsWith('я')) return `${name.slice(0, -1)}ю`;
  if (/[йь]$/.test(name)) return `${name.slice(0, -1)}я`;
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(name)) return `${name}а`;
  return name;
}

export const TYPE_TITLE: Record<InternshipType, string> = {
  practice: 'Практика',
  internship: 'Стажировка',
  part_time: 'Подработка',
};

/** «гибрид, Москва» / «удалённо». */
export function placeWhere(place: Pick<Internship, 'format' | 'city' | 'company'>): string {
  const format = FORMAT_LABEL[place.format]?.toLowerCase() ?? '';
  if (place.format === 'remote') return format;
  const city = place.city ?? place.company.city;
  return city ? `${format}, ${city}` : format;
}

/** «Практика · гибрид, Москва». */
export const placeLine = (place: Internship): string => `${TYPE_TITLE[place.type] ?? 'Место'} · ${placeWhere(place)}`;

export const responsesText = (n: number): string => `${n} ${plural(n, ['отклик', 'отклика', 'откликов'])}`;

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'нояб', 'дек'];

/** Когда откликнулся: «только что», «25 мин назад», «сегодня в 11:15», «вчера в 9:02», «27 сен». */
export function whenText(iso: string, now = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const min = Math.floor((now.getTime() - at.getTime()) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const time = `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86400000);
  if (days === 0) return `сегодня в ${time}`;
  if (days === 1) return `вчера в ${time}`;
  return `${at.getDate()} ${MONTHS[at.getMonth()]}`;
}

/** «+7 999 123-45-67» из «+79991234567»; другое — как есть. */
export function phoneText(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) {
    return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  }
  return phone;
}

/** Копирование в буфер: Clipboard API, в вебвью без него — через скрытое поле. true — получилось. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
