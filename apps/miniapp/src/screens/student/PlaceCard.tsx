import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Internship } from '../../api/types';
import { haptic } from '../../max/bridge';
import { companyInitial, coverOf, nameOf, placeFacts, placeWhere, typeChip, type SkillNames } from './place';
import { Cover, Eq, Icon, Pct } from './ui';

/** Сдвиг, после которого отпущенная карточка улетает. */
export const SWIPE_THRESHOLD = 100;
/** Сколько навыков помещается на карточке, остальное — «+N». */
const CARD_SKILLS = 6;

export type Direction = 1 | -1;

function CardFace({ place, names }: { place: Internship; names: SkillNames }) {
  const cover = coverOf(place);
  const match = place.match;
  const skills = match
    ? [
        ...[...match.mustMatched, ...match.niceMatched].map((c) => [c, true] as const),
        ...[...match.mustMissing, ...match.niceMissing].map((c) => [c, false] as const),
      ]
    : [];
  const facts = placeFacts(place);
  return (
    <>
      <Cover cls={cover.cls} label={cover.label} />
      <div className="topchips">
        <span className="gchip">{typeChip(place)}</span>
        {place.isDemo && <span className="gchip demo">тестовые данные</span>}
      </div>
      <div className="shade" />
      <div className="info">
        <div className="col" style={{ gap: 8 }}>
          <h2 className="title">{place.title}</h2>
          <div className="row">
            <span className="logo">{companyInitial(place.company.name)}</span>
            <span className="pc-where">
              {place.company.name} · {placeWhere(place)}
            </span>
          </div>
        </div>
        {match && (
          <div className="match">
            <Pct score={match.score} />
            <div className="col" style={{ gap: 6 }}>
              <Eq score={match.score} />
              <span className="lbl">совпадение по навыкам</span>
            </div>
          </div>
        )}
        {skills.length > 0 && (
          <div className="skills pc-skills">
            {skills.slice(0, CARD_SKILLS).map(([code, ok]) => (
              <span key={code} className={`sk ${ok ? 'ok' : 'no'}`}>
                {ok && <Icon name="check" />}
                <span className="pc-sk-name">{nameOf(names, code)}</span>
              </span>
            ))}
            {skills.length > CARD_SKILLS && <span className="sk no">+{skills.length - CARD_SKILLS}</span>}
          </div>
        )}
        {facts && <div className="facts">{facts}</div>}
      </div>
    </>
  );
}

/** Карточка под верхней: видна краем, не реагирует на жесты. */
export function BackCard({ place }: { place: Internship }) {
  const cover = coverOf(place);
  return (
    <div className="card back" aria-hidden="true">
      <div className={`cover ${cover.cls}`} />
    </div>
  );
}

interface SwipeCardProps {
  place: Internship;
  names: SkillNames;
  /** Карточка улетает: направление задаёт колода (свайп, кнопка или клавиша). */
  exit: Direction | null;
  onSwipe: (dir: Direction) => void;
}

/**
 * Верхняя карточка колоды. Свайп на pointer events: палец и мышь одинаково.
 * Вертикальную прокрутку отдаём браузеру (touch-action: pan-y), горизонталь — наша.
 */
export function SwipeCard({ place, names, exit, onSwipe }: SwipeCardProps) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const passed = useRef(false);
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (exit || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    passed.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!drag && Math.abs(dx) < 4) return;
    setDrag({ dx, dy });
    const over = Math.abs(dx) > SWIPE_THRESHOLD;
    if (over !== passed.current) {
      passed.current = over;
      if (over) haptic.selection();
    }
  };

  const finish = (e: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    const dx = drag?.dx ?? 0;
    setDrag(null);
    if (!cancelled && Math.abs(dx) > SWIPE_THRESHOLD) onSwipe(dx > 0 ? 1 : -1);
  };

  const dx = exit ? exit * 420 : (drag?.dx ?? 0);
  const dy = exit ? 40 : (drag?.dy ?? 0) * 0.25;
  const rotate = exit ? exit * 24 : dx / 18;
  const like = exit === 1 ? 1 : exit === -1 ? 0 : Math.max(0, Math.min(1, dx / SWIPE_THRESHOLD));
  const nope = exit === -1 ? 1 : exit === 1 ? 0 : Math.max(0, Math.min(1, -dx / SWIPE_THRESHOLD));

  return (
    <article
      className={`card pc-top${drag ? ' dragging' : ''}${exit ? ' exiting' : ''}`}
      aria-label={`Место: ${place.title}`}
      style={{ transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
    >
      <CardFace place={place} names={names} />
      <span className="stamp like" style={{ opacity: like }} aria-hidden="true">
        Интересно
      </span>
      <span className="stamp nope" style={{ opacity: nope }} aria-hidden="true">
        Не интересно
      </span>
    </article>
  );
}
