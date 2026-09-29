// Мелкие части экранов студента: иконки из макета, эквалайзер совпадения, обложка.
import type { CSSProperties, ReactNode } from 'react';
import { matchLevel } from './place';
import './student.css';

type IconName = 'check' | 'cross' | 'undo' | 'up' | 'cards' | 'heart' | 'user' | 'search' | 'lock' | 'doc' | 'refresh' | 'phone';

const PATHS: Record<IconName, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  undo: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  up: <path d="M6 15l6-6 6 6" />,
  cards: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="3" />
      <path d="M3 6v12M21 6v12" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
  doc: (
    <>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </>
  ),
  phone: <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" />,
};

export function Icon({ name, size, style }: { name: IconName; size?: 'xs' | 'sm' | 'lg'; style?: CSSProperties }) {
  return (
    <svg className={size ? `ic ${size}` : 'ic'} viewBox="0 0 24 24" aria-hidden="true" style={style}>
      {PATHS[name]}
    </svg>
  );
}

/** Высоты полос — как в макете: «живой» эквалайзер, а не ровная шкала. */
const BARS = [12, 20, 28, 16, 24, 28, 18, 26, 14, 22];

/** Эквалайзер: 10 полос, закрашено round(score / 10). onSurf — на светлой поверхности, а не на обложке. */
export function Eq({ score, onSurf, mini }: { score: number; onSurf?: boolean; mini?: boolean }) {
  const filled = Math.round(Math.max(0, Math.min(100, score)) / 10);
  const cls = ['eq', matchLevel(score), onSurf && 'on-surf', mini && 'mini'].filter(Boolean).join(' ');
  return (
    <div className={cls} aria-hidden="true">
      {BARS.map((h, i) => (
        <i key={i} className={i < filled ? 'on' : undefined} style={{ height: mini ? Math.round(h * 0.57) : h }} />
      ))}
    </div>
  );
}

export function Pct({ score, size }: { score: number; size?: number }) {
  return (
    <span className="pct" style={size ? { fontSize: size } : undefined}>
      {score}
      <small>%</small>
    </span>
  );
}

/** Обложка места: градиент по тегу, кольца или сетка и крупная надпись. */
export function Cover({ cls, label, labelBottom }: { cls: string; label: string; labelBottom?: boolean }) {
  return (
    <div className={`cover ${cls}`} aria-hidden="true">
      {cls === 'cv-data' ? (
        <div className="cv-grid" />
      ) : (
        <>
          <span className="cv-ring" style={{ width: 280, height: 280, right: -90, top: -70 }} />
          <span className="cv-ring" style={{ width: 170, height: 170, right: -30, top: -10 }} />
        </>
      )}
      <div className="cv-label" lang="ru" style={labelBottom ? { top: 'auto', bottom: 26 } : undefined}>
        {label}
      </div>
    </div>
  );
}
