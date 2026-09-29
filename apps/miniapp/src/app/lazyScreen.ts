// Разделы приложения — отдельные чанки: первое открытие грузит только главный экран и онбординг,
// раздел студента, раздел компании, форма места и «О сервисе» догружаются по переходу.
import { createElement, lazy, type ComponentType } from 'react';

type Loader<M> = () => Promise<M>;

export const loadStudent = () => import('../screens/student/studentRoutes');
export const loadEmployer = () => import('../screens/employer/employerRoutes');
export const loadPlaceForm = () => import('../screens/employer/PlaceForm');
export const loadAbout = () => import('../screens/AboutScreen');

const resets = new Set<() => void>();

/**
 * Ленивый экран. React.lazy запоминает сбой загрузки навсегда — после «Повторить» (ScreenBoundary)
 * экран создаётся заново через resetLazyScreens(), и чанк запрашивается ещё раз.
 */
export function lazyScreen<M>(load: Loader<M>, pick: (m: M) => ComponentType): ComponentType {
  const make = () => lazy(() => load().then((m) => ({ default: pick(m) })));
  let Screen = make();
  resets.add(() => {
    Screen = make();
  });
  return function LazyScreen() {
    return createElement(Screen);
  };
}

export function resetLazyScreens(): void {
  resets.forEach((reset) => reset());
}

/** Ошибки предзагрузки молчат: при переходе экран запросит чанк сам и покажет ошибку с «Повторить». */
const quiet = (load: Loader<unknown>) => void load().catch(() => {});

/**
 * Чанк раздела, в который приложение откроется, грузим сразу — параллельно с GET /api/me, а не после него.
 * Остальные разделы — когда браузер свободен: переход по кнопке тогда не ждёт сети.
 */
export function preloadScreens(startParam: string, role: 'student' | 'employer' | null): void {
  if (startParam === 'employer' || (!startParam && role === 'employer')) quiet(loadEmployer);
  else if (startParam === 'student' || startParam.startsWith('internship_') || (!startParam && role === 'student')) quiet(loadStudent);

  // requestIdleCallback нет в Safari — там через таймер
  const idle = (cb: () => void) =>
    typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500);
  idle(() => {
    quiet(loadStudent);
    quiet(loadEmployer);
  });
}
