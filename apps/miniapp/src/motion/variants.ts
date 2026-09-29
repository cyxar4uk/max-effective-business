// Общие варианты: проявление элементов списка. Переходы экранов — на CSS (AnimatedRoutes, motion.css).
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
