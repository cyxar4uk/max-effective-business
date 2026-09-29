// Общие варианты: проявление элементов списка и переходы экранов.
import type { Transition, Variants } from 'motion/react';
import { fade, spring, STAGGER, STAGGER_MAX } from './springs';

/**
 * Элемент списка проявляется снизу на 8 px со сдвигом 20 мс по порядку (не дальше восьмого).
 * Разворачивается в пропсы motion-элемента: `<motion.li {...listItem(i, reduced)}>`.
 */
export function listItem(index: number, reduced: boolean, delay = 0) {
  const d = delay + Math.min(index, STAGGER_MAX - 1) * STAGGER;
  return reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { ...fade, delay: d } }
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay: d } };
}

/**
 * Переход экранов:
 * - forward — новый экран въезжает справа на 24 px и проявляется поверх старого;
 * - back — зеркально: верхний экран уезжает вправо и гаснет, под ним с −24 px выезжает прежний;
 * - tab — вкладки: только перекрёстное проявление;
 * - fade — экран со своей анимацией (шторка) и prefers-reduced-motion.
 */
export type ScreenMode = 'forward' | 'back' | 'tab' | 'fade';

const moveAndFade = (opacityDelay = 0): Transition => ({ x: spring, opacity: { ...fade, duration: 0.2, delay: opacityDelay } });
/** Нижний экран исчезает, когда верхний уже непрозрачен: так нет «провала» фона посередине. */
const hideUnder: Transition = { x: spring, opacity: { duration: 0.01, delay: 0.3 } };

export const screenVariants: Variants = {
  initial: (m: ScreenMode) =>
    m === 'forward' ? { x: 24, opacity: 0, zIndex: 1 } : m === 'back' ? { x: -24, opacity: 1, zIndex: 0 } : { opacity: 0, zIndex: 1 },
  enter: (m: ScreenMode) => ({
    x: 0,
    opacity: 1,
    zIndex: m === 'back' ? 0 : 1,
    transition: m === 'back' ? moveAndFade() : m === 'forward' ? moveAndFade() : m === 'tab' ? { ...fade, duration: 0.2 } : fade,
  }),
  exit: (m: ScreenMode) =>
    m === 'back'
      ? { x: 24, opacity: 0, zIndex: 1, pointerEvents: 'none', transition: moveAndFade(0.05) }
      : m === 'forward'
        ? { x: -24, opacity: 0, zIndex: 0, pointerEvents: 'none', transition: hideUnder }
        : { opacity: 0, zIndex: 0, pointerEvents: 'none', transition: { opacity: { duration: 0.01, delay: m === 'tab' ? 0.2 : 0.15 } } },
};
