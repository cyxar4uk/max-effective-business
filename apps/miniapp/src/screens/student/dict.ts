// Справочники навыков и тегов грузятся один раз за сеанс: они меняются только с выкладкой сервера.
import { api } from '../../api/client';
import type { Items, Skills, Tag } from '../../api/types';

let skills: Promise<Skills> | null = null;
let tags: Promise<Items<Tag>> | null = null;

/** Кэш с повтором: при ошибке следующий вызов спросит сервер заново. */
function cached<T>(get: () => T | null, set: (p: T | null) => void, load: () => T): T {
  const hit = get();
  if (hit) return hit;
  const p = load();
  set(p);
  (p as Promise<unknown>).catch(() => set(null));
  return p;
}

export const loadSkills = (): Promise<Skills> =>
  cached(
    () => skills,
    (p) => (skills = p),
    () => api.skills(),
  );

export const loadTags = (): Promise<Items<Tag>> =>
  cached(
    () => tags,
    (p) => (tags = p),
    () => api.tags(),
  );
