import { animate, motion, useMotionValue, useTransform, type MotionValue, type PanInfo } from 'motion/react';
import { useEffect, useImperativeHandle, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { haptic } from '../max/bridge';
import { clamp, fade, flick, project, spring, useReduced } from '../motion/springs';
import './SwipeDeck.css';

/** 1 — вправо («Интересно», «Пригласить»), −1 — влево («Не интересно»). */
export type SwipeDir = 1 | -1;

export interface SwipeDeckHandle {
  /** Увести верхнюю карточку кнопкой или клавишей — тем же вылетом, что и свайпом. false — не ушла. */
  swipe(dir: SwipeDir): boolean;
}

/** Печать полностью видна при сдвиге на столько пикселей. */
const STAMP_FULL = 120;
/** Решение: проекция сдвига дальше этой доли ширины карточки… */
const DECIDE = 0.35;
/** …или бросок быстрее, px/с. */
const FLICK_SPEED = 800;
/** Наклон при перетаскивании: x / 20 градусов, не больше. */
const MAX_TILT = 15;
/** Пауза между решениями с кнопок и клавиш: двойное нажатие не уводит две карточки. */
const COOLDOWN_MS = 180;

type Role = 'top' | 'back' | 'fly';
type Velocity = { x: number; y: number };

interface DeckCardProps {
  role: Role;
  /** Куда улетает (fly) или откуда въехала, если смонтирована сразу верхней («Вернуть», ошибка сервера). */
  dir: SwipeDir | null;
  velocity: Velocity | null;
  progress: MotionValue<number>;
  lean?: MotionValue<number>;
  stamps?: { like: string; nope: string };
  label?: string;
  reduced: boolean;
  onDecide: (dir: SwipeDir, velocity: Velocity) => void;
  onGone: () => void;
  children: ReactNode;
}

/**
 * Одна карточка колоды. Роль задаёт поведение:
 * top — тянется пальцем 1:1 (drag в motion), наклон x/20°, печати по |x|; отпускание — решение или пружина назад;
 * back — лежит под верхней, растёт 0.94 → 1 и поднимается 14 → 0 по мере увода верхней;
 * fly — улетает по траектории броска на ±1.5 ширины экрана, получая скорость жеста.
 * Все анимации — пружины на motion values: прерываются и продолжаются с текущего значения.
 */
function DeckCard({ role, dir, velocity, progress, lean, stamps, label, reduced, onDecide, onGone, children }: DeckCardProps) {
  const el = useRef<HTMLElement>(null);
  const enterFrom = role === 'top' && dir && !reduced ? dir * 1.5 * window.innerWidth : 0;
  const x = useMotionValue(enterFrom);
  const y = useMotionValue(role === 'back' && !reduced ? 14 : 0);
  const scale = useMotionValue(role === 'back' && !reduced ? 0.94 : 1);
  const opacity = useMotionValue(reduced && (role === 'back' || dir) ? 0 : 1);
  const rotate = useMotionValue(clamp(enterFrom / 20, -MAX_TILT, MAX_TILT));
  const like = useTransform(x, [0, STAMP_FULL], [0, 1]);
  const nope = useTransform(x, [-STAMP_FULL, 0], [1, 0]);
  // Полёт: наклон продолжается от того, что было в момент отпускания, — без скачка
  const flyFrom = useRef<{ x0: number; r0: number } | null>(null);
  const dragY0 = useRef(0);
  const passed = useRef(false);
  const gone = useRef(onGone);
  useEffect(() => {
    gone.current = onGone;
  });

  useEffect(
    () =>
      x.on('change', (v) => {
        const f = flyFrom.current;
        rotate.set(f ? f.r0 + (v - f.x0) / 40 : clamp(v / 20, -MAX_TILT, MAX_TILT));
      }),
    [x, rotate],
  );

  const width = () => el.current?.offsetWidth ?? 340;

  useEffect(() => {
    if (role === 'back') {
      if (reduced) {
        opacity.set(0);
        scale.set(1);
        y.set(0);
        return;
      }
      const follow = (p: number) => {
        scale.set(0.94 + 0.06 * p);
        y.set(14 * (1 - p));
      };
      follow(progress.get());
      return progress.on('change', follow);
    }

    if (role === 'top') {
      flyFrom.current = null;
      const controls = reduced
        ? [animate(opacity, 1, fade), animate(x, 0, fade), animate(y, 0, fade), animate(scale, 1, fade)]
        : [
            animate(opacity, 1, fade),
            // Возврат со стороны (вернули или сервер отказал) — с отскоком; подъём из-под верхней — без
            animate(x, 0, x.get() !== 0 ? flick : spring),
            animate(y, 0, x.get() !== 0 ? flick : spring),
            animate(scale, 1, spring),
          ];
      const sync = (v: number) => {
        progress.set(clamp(Math.abs(v) / (width() * 0.6), 0, 1));
        lean?.set(clamp(v / STAMP_FULL, -1, 1));
      };
      sync(x.get());
      const off = x.on('change', sync);
      return () => {
        off();
        controls.forEach((c) => c.stop());
      };
    }

    // fly
    const side = dir ?? 1;
    lean?.set(0);
    if (reduced) {
      const c = animate(opacity, 0, { ...fade, onComplete: () => gone.current() });
      return () => c.stop();
    }
    flyFrom.current = { x0: x.get(), r0: rotate.get() };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const target = side * 1.5 * w;
    const vx = velocity?.x ?? 0;
    const vy = velocity?.y ?? 0;
    // Траектория броска: продолжаем направление скорости; с кнопки — лёгкое падение вниз
    const ty =
      velocity && Math.abs(vx) > 100
        ? clamp(y.get() + (vy / Math.abs(vx)) * Math.abs(target - x.get()), -h * 0.4, h * 0.4)
        : y.get() + 40;
    const cx = animate(x, target, { ...flick, velocity: vx, onComplete: () => gone.current() });
    const cy = animate(y, ty, { ...flick, velocity: vy });
    return () => {
      cx.stop();
      cy.stop();
    };
    // Роль и направление меняются вместе; остальное — стабильные motion values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, dir]);

  const onDragStart = () => {
    y.stop();
    dragY0.current = y.get();
    passed.current = false;
  };

  const onDrag = (_: unknown, info: PanInfo) => {
    y.set(dragY0.current + info.offset.y);
    const over = Math.abs(x.get()) > DECIDE * width();
    if (over !== passed.current) {
      passed.current = over;
      if (over) haptic.selection();
    }
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { x: vx, y: vy } = info.velocity;
    const end = x.get() + project(vx);
    const side: SwipeDir | 0 =
      Math.abs(vx) > FLICK_SPEED ? (vx > 0 ? 1 : -1) : Math.abs(end) > DECIDE * width() ? (end > 0 ? 1 : -1) : 0;
    if (side) {
      onDecide(side, { x: vx, y: vy });
      return;
    }
    if (reduced) {
      animate(x, 0, fade);
      animate(y, 0, fade);
    } else {
      animate(x, 0, { ...flick, velocity: vx });
      animate(y, 0, { ...flick, velocity: vy });
    }
  };

  const top = role === 'top';
  return (
    <motion.article
      ref={el}
      className={`card deck-card is-${role}`}
      style={{ x, y, rotate, scale, opacity, zIndex: role === 'fly' ? 3 : top ? 2 : 1 }}
      drag={top ? 'x' : false}
      dragMomentum={false}
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      aria-label={top ? label : undefined}
      aria-hidden={top ? undefined : true}
      inert={!top}
    >
      {children}
      {stamps && (
        <>
          <motion.span className="stamp like" style={{ opacity: like }} aria-hidden="true">
            {stamps.like}
          </motion.span>
          <motion.span className="stamp nope" style={{ opacity: nope }} aria-hidden="true">
            {stamps.nope}
          </motion.span>
        </>
      )}
    </motion.article>
  );
}

interface SwipeDeckProps<T> {
  /** Очередь, верхняя — первая. Решение убирает карточку из очереди у родителя (onSwipe). */
  items: T[];
  getKey: (item: T) => string | number;
  /** active — карточка верхняя или улетает (для «оживления» содержимого, например эквалайзера). */
  renderCard: (item: T, active: boolean) => ReactNode;
  onSwipe: (item: T, dir: SwipeDir) => void;
  cardLabel?: (item: T) => string;
  stamps?: { like: string; nope: string };
  /** −1…1: куда и насколько наклонена верхняя карточка — для подсветки кнопок (DeckButton). */
  lean?: MotionValue<number>;
  /** Что показать, когда карточек нет (под улетающей последней). */
  empty?: ReactNode;
  className?: string;
  ref?: Ref<SwipeDeckHandle>;
}

type Flying<T> = { item: T; key: string | number; dir: SwipeDir; velocity: Velocity | null };

/**
 * Колода карточек со свайпом — общая для студента (места) и работодателя (кандидаты).
 * Решение отдаётся родителю сразу при вылете: следующая карточка доступна, пока предыдущая ещё летит.
 * Вернуть карточку — снова положить её первой в items: она въедет с той стороны, куда улетела.
 */
export function SwipeDeck<T>({ items, getKey, renderCard, onSwipe, cardLabel, stamps, lean, empty, className, ref }: SwipeDeckProps<T>) {
  const reduced = useReduced();
  const progress = useMotionValue(0);
  const [flying, setFlying] = useState<Flying<T>[]>([]);
  const [departed, setDeparted] = useState<ReadonlyMap<string | number, SwipeDir>>(new Map());
  const lastSwipe = useRef(0);
  const top = items[0] as T | undefined;
  const next = items[1] as T | undefined;

  const launch = (dir: SwipeDir, velocity: Velocity | null): boolean => {
    if (top === undefined) return false;
    const key = getKey(top);
    setDeparted((m) => new Map(m).set(key, dir));
    setFlying((f) => [...f.filter((c) => c.key !== key), { item: top, key, dir, velocity }]);
    haptic.impact('light');
    onSwipe(top, dir);
    return true;
  };

  useImperativeHandle(ref, () => ({
    swipe(dir) {
      const now = performance.now();
      if (now - lastSwipe.current < COOLDOWN_MS) return false;
      lastSwipe.current = now;
      return launch(dir, null);
    },
  }));

  const land = (key: string | number) => setFlying((f) => f.filter((c) => c.key !== key));

  const shown = new Set(items.slice(0, 2).map(getKey));
  const cards: { item: T; key: string | number; role: Role; dir: SwipeDir | null; velocity: Velocity | null }[] = [];
  if (next !== undefined) cards.push({ item: next, key: getKey(next), role: 'back', dir: null, velocity: null });
  if (top !== undefined) {
    const key = getKey(top);
    cards.push({ item: top, key, role: 'top', dir: departed.get(key) ?? null, velocity: null });
  }
  for (const f of flying) if (!shown.has(f.key)) cards.push({ ...f, role: 'fly' });

  return (
    <div className={className ? `stack deck ${className}` : 'stack deck'}>
      {top === undefined && empty}
      {cards.map((c) => (
        <DeckCard
          key={c.key}
          role={c.role}
          dir={c.dir}
          velocity={c.velocity}
          progress={progress}
          lean={lean}
          stamps={stamps}
          label={cardLabel?.(c.item)}
          reduced={reduced}
          onDecide={(dir, velocity) => launch(dir, velocity)}
          onGone={() => land(c.key)}
        >
          {renderCard(c.item, c.role !== 'back')}
        </DeckCard>
      ))}
    </div>
  );
}

interface DeckButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Сторона кнопки: подсвечивается, когда карточку тянут туда. Без стороны — служебная кнопка. */
  side?: SwipeDir;
  lean?: MotionValue<number>;
  icon: ReactNode;
}

/** Круглая кнопка под колодой: растёт и подсвечивается кольцом, пока карточку тянут в её сторону. */
export function DeckButton({ side, lean, icon, className, children, ...rest }: DeckButtonProps) {
  const idle = useMotionValue(0);
  const src = lean ?? idle;
  const toward = useTransform(src, (v) => clamp(side ? v * side : 0, 0, 1));
  const scale = useTransform(toward, [0, 1], [1, 1.08]);
  const ring = useTransform(toward, [0.15, 1], [0, 1]);
  return (
    <button type="button" className={className ? `fab ${className}` : 'fab'} {...rest}>
      <motion.span className="fab-lean" style={side ? { scale } : undefined}>
        {side && <motion.i className="fab-ring" style={{ opacity: ring }} aria-hidden="true" />}
        <span className="c">{icon}</span>
      </motion.span>
      {children}
    </button>
  );
}
