import { Suspense, useEffect, useState, type ReactNode } from 'react';
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

function modeFor(from: string, to: string, back: boolean, replace: boolean): ScreenMode {
  if (replace && from === '/') return 'instant';
  if (to.startsWith('/consent')) return 'fade';
  if (TABS.has(from) && TABS.has(to)) return 'tab';
  return back ? 'back' : 'forward';
}

interface Screen {
  location: Location;
  mode: ScreenMode;
}

/**
 * `<Routes>` с переходами экранов на CSS-анимациях — без библиотеки движения в первом чанке.
 * Уходящий экран остаётся со своим адресом (Routes location) и лежит в той же ячейке сетки, что и новый.
 * Направление: «Назад» (POP к меньшему индексу истории) — зеркально; смена только ?query — без перехода.
 */
export function AnimatedRoutes({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navType = useNavigationType();
  const [nav, setNav] = useState(() => ({ key: location.key, idx: historyIndex(), screen: { location, mode: 'instant' } as Screen }));
  const [leaving, setLeaving] = useState<Screen[]>([]);

  if (nav.key !== location.key) {
    const idx = historyIndex();
    const from = nav.screen.location.pathname;
    if (from === location.pathname) {
      // Тот же экран с другим ?query: без перехода, режим прежний — иначе анимация проиграется заново
      setNav({ key: location.key, idx, screen: { location, mode: nav.screen.mode } });
    } else {
      const back = navType === 'POP' && idx < nav.idx;
      const mode = modeFor(from, location.pathname, back, navType === 'REPLACE');
      setNav({ key: location.key, idx, screen: { location, mode } });
      // Уходящий экран доигрывает анимацию с режимом нового перехода; вернулись на него же — он входит заново
      setLeaving((prev) => [
        ...prev.filter((s) => s.location.pathname !== from && s.location.pathname !== location.pathname),
        ...(mode === 'instant' ? [] : [{ location: nav.screen.location, mode }]),
      ]);
    }
  }

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
