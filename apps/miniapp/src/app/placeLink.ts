// Ссылка на место для QR-кода стенда и «Поделиться»: диплинк мини-приложения с параметром запуска
// (docs/05_max_platform.md): https://max.ru/<ник_бота>?startapp=internship_<id>. Разбор — для сканера студента.
import { ABOUT } from './about';

/** Самый большой id места: столбец в базе — integer. */
const MAX_ID = 2_147_483_647;

/** Параметр запуска места: `internship_<id>` (docs/api.md, бот использует тот же). */
export const placeParam = (id: number): string => `internship_${id}`;

/** Диплинк на место: открывает мини-приложение сразу на карточке. */
export const placeLink = (id: number): string => `https://max.ru/${ABOUT.botNick}?startapp=${placeParam(id)}`;

/** Ссылка без протокола — подпись под QR-кодом. */
export const placeLinkText = (id: number): string => placeLink(id).replace(/^https:\/\//, '');

/** id места из параметра запуска `internship_<id>`; иначе null. */
export function placeIdFromParam(param: string | null | undefined): number | null {
  const m = /^internship_(\d{1,10})$/.exec(param ?? '');
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_ID ? id : null;
}

/**
 * id места из строки QR-кода. Принимаем:
 * - `https://max.ru/<ник нашего бота>?startapp=internship_<id>` (и `http://`, и без протокола, и `www.max.ru`);
 * - тот же адрес с `?start=` — диплинк на диалог с ботом, который тоже ведёт к месту;
 * - сам параметр `internship_<id>`.
 * Чужой бот, чужой сайт или другой параметр — null.
 */
export function placeIdFromCode(raw: string): number | null {
  const text = raw.trim();
  const direct = placeIdFromParam(text);
  if (direct !== null) return direct;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'max.ru' && host !== 'www.max.ru') return null;
  const nick = url.pathname.replace(/^\/+|\/+$/g, '');
  if (nick.toLowerCase() !== ABOUT.botNick.toLowerCase()) return null;
  return placeIdFromParam(url.searchParams.get('startapp') ?? url.searchParams.get('start'));
}
