import { Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Routes, useLocation, useNavigationType, type Location } from 'react-router';
import { ScreenBoundary } from '../app/ScreenBoundary';
import { ScreenSkeleton } from '../components/Skeleton';
import { ScreenPresence } from './screenPresence';
import './motion.css';

/**
 * Переход экранов (кривые и длительности — в motion.css):
 * - forward — новый экран въезжает справа на 24 px и проявляется поверх старого;
 * - back — зеркально: верхний экран уезжает вправо и гаснет, под ним с −24 px выезжает прежний;
 * - tab — вкладки: только перекрёстное проявление;
 * - fade — экран со своей анимацией (шторка); при prefers-reduced-motion так выглядят все переходы;
 * - instant — без анимации (редирект при запуске: главный не должен мелькать).
 */
type ScreenMode = 'forward' | 'back' | 'tab' | 'fade' | 'instant';

/** Вкладки нижней навигации студента: между ними — только перекрёстное проявление. */
const TABS = new Set(['/student', '/student/interests', '/student/profile']);

/** Сколько уходящий экран остаётся под новым: самая длинная анимация ухода — 0,35 с. */
const EXIT_MS = 420;

/** Позиция в истории: BrowserRouter хранит её в history.state.idx. */
const historyIndex = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

/**
 * Прокрутка экрана: окна и, если есть, собственной области экрана с [data-scroll-root] — у студента прокручивается
 * не окно, а .st-main под нижней навигацией.
 */
interface ScrollPos {
  win: number;
  inner: number;
}
const TOP: ScrollPos = { win: 0, inner: 0 };

/** Прокрутка ушедших экранов по ключу записи истории: «Назад» возвращает на неё. */
const scrollByKey = new Map<string, ScrollPos>();
/**
 * Сколько держим прежнюю прокрутку экрана, на который вернулись. Пока уходящий экран рядом, документ высокий и
 * прокрутка встаёт сразу; когда его убирают, экран может быть ещё скелетоном (данные грузятся заново), и браузер
 * срезает прокрутку — её возвращаем, как только экран дорастёт. Любое касание или колесо — пользователь листает сам.
 */
const RESTORE_MS = 2000;

const scrollRoot = () => document.querySelector<HTMLElement>('.route.in [data-scroll-root]');
const currentScroll = (): ScrollPos => ({ win: window.scrollY, inner: scrollRoot()?.scrollTop ?? 0 });

// Прокрутку ведём сами: браузер восстанавливает её до того, как экран отрисован, и промахивается
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

/** Выставить прокрутку; не нулевую — держать по кадрам до RESTORE_MS, пока пользователь не начнёт листать сам. */
function restoreScroll(to: ScrollPos): () => void {
  window.scrollTo(0, to.win);
  if (to.win === 0 && to.inner === 0) return () => {};
  const until = performance.now() + RESTORE_MS;
  let frame = 0;
  const tick = () => {
    if (performance.now() > until) return stop();
    if (Math.abs(window.scrollY - to.win) >= 1) window.scrollTo(0, to.win);
    const root = scrollRoot();
    if (root && Math.abs(root.scrollTop - to.inner) >= 1) root.scrollTop = to.inner;
    frame = requestAnimationFrame(tick);
  };
  const userScroll = ['touchstart', 'wheel', 'keydown'] as const;
  function stop() {
    cancelAnimationFrame(frame);
    for (const e of userScroll) window.removeEventListener(e, stop);
  }
  for (const e of userScroll) window.addEventListener(e, stop, { passive: true });
  frame = requestAnimationFrame(tick);
  return stop;
}

function modeFor(from: string, to: string, back: boolean, replace: boolean): ScreenMode {
  if (replace && from === '/') return 'instant';
  if (to.startsWith('/consent')) return 'fade';
  if (TABS.has(from) && TABS.has(to)) return 'tab';
  return back ? 'back' : 'forward';
}

interface Screen {
  location: Location;
  mode: ScreenMode;
  /** Уходящий экран: сдвиг по вертикали, чтобы он стоял на месте, пока окно прокручивается под новый. */
  shift?: number;
}

/**
 * `<Routes>` с переходами экранов на CSS-анимациях — без библиотеки движения в первом чанке.
 * Уходящий экран остаётся со своим адресом (Routes location) и лежит в той же ячейке сетки, что и новый.
 * Направление: «Назад» (POP к меньшему индексу истории) — зеркально; смена только ?query — без перехода.
 * Прокрутка: новый экран — с начала, «Назад» и «Вперёд» браузера (POP) — на прежнюю позицию этой записи.
 */
export function AnimatedRoutes({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navType = useNavigationType();
  const [nav, setNav] = useState(() => ({
    key: location.key,
    idx: historyIndex(),
    screen: { location, mode: 'instant' } as Screen,
    scrollTo: null as ScrollPos | null,
  }));
  const [leaving, setLeaving] = useState<Screen[]>([]);

  if (nav.key !== location.key) {
    const idx = historyIndex();
    const from = nav.screen.location.pathname;
    if (from === location.pathname) {
      // Тот же экран с другим ?query: без перехода, режим прежний — иначе анимация проиграется заново.
      // Прокрутку не трогаем: шаги формы ведут её сами
      setNav({ key: location.key, idx, screen: { location, mode: nav.screen.mode }, scrollTo: null });
    } else {
      const back = navType === 'POP' && idx < nav.idx;
      const mode = modeFor(from, location.pathname, back, navType === 'REPLACE');
      const now = currentScroll();
      scrollByKey.set(nav.key, now);
      const target = navType === 'POP' ? (scrollByKey.get(location.key) ?? TOP) : TOP;
      setNav({ key: location.key, idx, screen: { location, mode }, scrollTo: target });
      // Уходящий экран доигрывает анимацию с режимом нового перехода; вернулись на него же — он входит заново
      setLeaving((prev) => [
        ...prev.filter((s) => s.location.pathname !== from && s.location.pathname !== location.pathname),
        ...(mode === 'instant' ? [] : [{ location: nav.screen.location, mode, shift: target.win - now.win }]),
      ]);
    }
  }

  // До отрисовки кадра: иначе новый экран мелькнёт с прокруткой старого
  useLayoutEffect(() => {
    if (nav.scrollTo === null) return;
    return restoreScroll(nav.scrollTo);
  }, [nav.key, nav.scrollTo]);

  useEffect(() => {
    if (!leaving.length) return;
    const timer = window.setTimeout(() => setLeaving([]), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  // Один плоский список с ключом-путём: экран, ставший уходящим, не пересоздаётся и сохраняет состояние
  const screens = [
    ...leaving.map((s) => ({ ...s, out: true })),
    { ...nav.screen, out: false },
  ];

  return (
    <div className="routes">
      {screens.map((s) => (
        <div
          key={s.location.pathname}
          className={`route ${s.out ? 'out' : 'in'} ${s.mode}`}
          aria-hidden={s.out || undefined}
          inert={s.out}
          style={s.out && s.shift ? { top: s.shift } : undefined}
        >
          {/* Экран грузится своим чанком: пока его нет — скелетон, сбой загрузки — ошибка с «Повторить» */}
          <ScreenPresence.Provider value={!s.out}>
            <ScreenBoundary>
              <Suspense fallback={<ScreenSkeleton />}>
                <Routes location={s.location}>{children}</Routes>
              </Suspense>
            </ScreenBoundary>
          </ScreenPresence.Provider>
        </div>
      ))}
    </div>
  );
}

// WebKit включает :active на касании, только если на документе есть обработчик touchstart
document.addEventListener('touchstart', () => {}, { passive: true });
