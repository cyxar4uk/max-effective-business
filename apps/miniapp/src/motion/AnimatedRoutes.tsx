import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Routes, useLocation, useNavigationType } from 'react-router';
import { useReduced } from './springs';
import { screenVariants, type ScreenMode } from './variants';
import './motion.css';

/** Вкладки нижней навигации студента: между ними — только перекрёстное проявление. */
const TABS = new Set(['/student', '/student/interests', '/student/profile']);

/** Позиция в истории: BrowserRouter хранит её в history.state.idx. */
const historyIndex = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

function modeFor(from: string, to: string, back: boolean, reduced: boolean): ScreenMode {
  if (reduced || to.startsWith('/consent')) return 'fade';
  if (TABS.has(from) && TABS.has(to)) return 'tab';
  return back ? 'back' : 'forward';
}

/**
 * `<Routes>` с переходами экранов. Уходящий экран остаётся со своим адресом (Routes location) и лежит
 * в той же ячейке сетки, что и новый, — без абсолютного позиционирования.
 * Направление: «Назад» (POP к меньшему индексу истории) — зеркально; смена только ?query — без перехода.
 */
export function AnimatedRoutes({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navType = useNavigationType();
  const reduced = useReduced();
  const [nav, setNav] = useState(() => ({ key: location.key, path: location.pathname, idx: historyIndex(), mode: 'fade' as ScreenMode }));

  if (nav.key !== location.key) {
    const idx = historyIndex();
    const back = navType === 'POP' && idx < nav.idx;
    setNav({ key: location.key, path: location.pathname, idx, mode: modeFor(nav.path, location.pathname, back, reduced) });
  }

  return (
    <div className="routes">
      <AnimatePresence initial={false} custom={nav.mode}>
        <motion.div
          key={location.pathname}
          className="route"
          custom={nav.mode}
          variants={screenVariants}
          initial="initial"
          animate="enter"
          exit="exit"
        >
          <Routes location={location}>{children}</Routes>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// WebKit включает :active на касании, только если на документе есть обработчик touchstart
document.addEventListener('touchstart', () => {}, { passive: true });
