// Разделы приложения — отдельные чанки: первое открытие грузит только главный экран и онбординг,
// раздел студента, раздел компании, форма места и «О сервисе» догружаются по переходу.
//
// Сбой загрузки чанка лечит только перезагрузка страницы: Chromium запоминает неудачный import() адреса
// до перезагрузки, а __vitePreload — уже запрошенные CSS (второй раз экран пришёл бы без стилей). Старые
// хеши после выкатки новой версии тоже пропадают (nginx отдаёт 404). Данные запуска MAX перезагрузку
// переживают: max-web-app.js берёт WebAppData из location.hash, а если его нет — из sessionStorage,
// куда сам сохранил при первом открытии.
import { createElement, lazy, type ComponentType } from 'react';

/** Чанк экрана не загрузился (сеть, выкатка новой версии). ScreenBoundary отличает его от ошибки отрисовки. */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Не загрузился чанк экрана', { cause });
    this.name = 'ChunkLoadError';
  }
}

interface Loader<M> {
  run: () => Promise<M>;
  loaded: boolean;
}

/** Какой-то чанк уже не загрузился: кэш браузера помнит отказ, следующий незагруженный — только через перезагрузку. */
let broken = false;

function loader<M>(load: () => Promise<M>): Loader<M> {
  const l: Loader<M> = {
    loaded: false,
    run: () =>
      load().then(
        (m) => {
          l.loaded = true;
          return m;
        },
        (err: unknown) => {
          broken = true;
          throw new ChunkLoadError(err);
        },
      ),
  };
  return l;
}

export const loadStudent = loader(() => import('../screens/student/studentRoutes'));
export const loadEmployer = loader(() => import('../screens/employer/employerRoutes'));
export const loadPlaceForm = loader(() => import('../screens/employer/PlaceForm'));
export const loadAbout = loader(() => import('../screens/AboutScreen'));
export const loadDocs = loader(() => import('../screens/docs/docsRoutes'));

const RELOAD_KEY = 'tandem.chunkReloadAt';
/** Сама страница перезагружается не чаще раза в 10 с — иначе при лежащем сервере вышел бы цикл. */
const RELOAD_GAP_MS = 10_000;

/** Сервер отвечает: без этого перезагрузка без сети сменила бы приложение страницей браузера «Нет интернета». */
async function serverReachable(): Promise<boolean> {
  if (navigator.onLine === false) return false;
  try {
    const res = await fetch('/', { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Перезагрузить приложение на текущем адресе, если сервер на связи. false — связи нет, остаёмся на экране. */
export async function reloadApp(): Promise<boolean> {
  if (!(await serverReachable())) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Хранилище недоступно — защита от цикла не сработает, но и сам цикл ограничен проверкой сервера
  }
  window.location.reload();
  return true;
}

function reloadedRecently(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) < RELOAD_GAP_MS;
  } catch {
    return true;
  }
}

/** Пока страница перезагружается, на экране остаётся скелетон, а не ошибка. */
const never = () => new Promise<never>(() => {});

/** Сам перезагрузиться на адрес нового экрана; не вышло (недавно уже пробовали или нет связи) — вернуть управление. */
async function recover(): Promise<void> {
  if (reloadedRecently()) return;
  if (await reloadApp()) await never();
}

/**
 * Ленивый экран. Чанк уже падал в этой странице (в том числе при фоновой предзагрузке) — сразу перезагрузка на адрес
 * экрана, а не закэшированный отказ. Упал сейчас — то же; если перезагрузка не помогла или нет связи —
 * ChunkLoadError, и ScreenBoundary покажет «Экран не загрузился» с «Повторить».
 */
export function lazyScreen<M>(load: Loader<M>, pick: (m: M) => ComponentType): ComponentType {
  const Screen = lazy(async () => {
    if (broken && !load.loaded) {
      await recover();
      // Перезагрузка не вышла (только что уже была или нет связи). Грузить нельзя: пришёл бы закэшированный отказ
      // или экран без стилей — сразу ошибка с «Повторить»
      throw new ChunkLoadError(new Error('Чанк уже не загрузился в этой странице'));
    }
    try {
      return { default: pick(await load.run()) };
    } catch (err) {
      await recover();
      throw err;
    }
  });
  return function LazyScreen() {
    return createElement(Screen);
  };
}

/** Ошибки предзагрузки молчат: отказ запомнен (broken), и при переходе экран перезагрузится, а не упадёт. */
const quiet = (load: Loader<unknown>) => void load.run().catch(() => {});

/**
 * Чанк раздела, в который приложение откроется, грузим сразу — параллельно с GET /api/me, а не после него.
 * Остальные разделы — когда браузер свободен: переход по кнопке тогда не ждёт сети.
 */
export function preloadScreens(startParam: string, role: 'student' | 'employer' | null): void {
  if (startParam === 'employer' || (!startParam && role === 'employer')) quiet(loadEmployer);
  else if (startParam === 'student' || startParam.startsWith('internship_') || (!startParam && role === 'student')) quiet(loadStudent);
  else if (startParam.startsWith('docs_')) quiet(loadDocs);

  // requestIdleCallback нет в Safari — там через таймер
  const idle = (cb: () => void) =>
    typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb, { timeout: 3000 }) : setTimeout(cb, 1500);
  idle(() => {
    quiet(loadStudent);
    quiet(loadEmployer);
  });
}
