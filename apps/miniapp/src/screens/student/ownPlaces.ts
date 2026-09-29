// «Ваше место» первым в колоде: проверяющий проходит обе роли одним аккаунтом (решение Ильи, 29.09).
import { api } from '../../api/client';
import type { Internship } from '../../api/types';

/**
 * Открытые места самого пользователя-работодателя, на которые он ещё не откликался как студент.
 * Ставим их первыми, даже если лента их не вернула (свои места могут не пройти фильтры формата и города).
 * Фильтр тегами ленты действует и на них. Ошибка не ломает ленту — просто без своих мест.
 */
export async function loadOwnPlaces(tags: string[]): Promise<Internship[]> {
  try {
    const { items } = await api.employerInternships();
    const open = items.filter((p) => p.status === 'open' && (tags.length === 0 || p.tags.some((t) => tags.includes(t))));
    // Полная карточка — ради match и myInterest: их отдаёт только GET /api/internships/:id
    const full = await Promise.all(open.map((p) => api.internship(p.id).catch(() => null)));
    return full.filter((p): p is Internship => p !== null && (p.myInterest ?? null) === null);
  } catch {
    return [];
  }
}

/** Свои места — первыми, без дублей с лентой. */
export function withOwnFirst(own: Internship[], feed: Internship[]): Internship[] {
  const ids = new Set(own.map((p) => p.id));
  return [...own.map((p) => ({ ...p, isOwner: true })), ...feed.filter((p) => !ids.has(p.id))];
}
