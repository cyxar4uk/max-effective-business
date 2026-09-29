// Параметры движения «Тандема» — общие для экранов студента и работодателя.
// Правила (Apple, «Designing Fluid Interfaces»): анимируем только transform и opacity; всё, что тянет
// пользователь, — пружины: прерываемые, стартуют с текущего значения и получают скорость жеста.
import { useReducedMotion, type Transition } from 'motion/react';

/** По умолчанию: без отскока, как системные переходы. */
export const spring = { type: 'spring', bounce: 0, duration: 0.35 } as const satisfies Transition;
/** После броска или флика (отпустили карточку): небольшой отскок передаёт инерцию. */
export const flick = { type: 'spring', bounce: 0.2, duration: 0.4 } as const satisfies Transition;
/** Шторки. */
export const sheet = { type: 'spring', bounce: 0.15, duration: 0.3 } as const satisfies Transition;
/** «Это тандем!»: сферы навстречу и «галочка». */
export const meet = { type: 'spring', bounce: 0.25, duration: 0.5 } as const satisfies Transition;
export const pop = { type: 'spring', bounce: 0.4, duration: 0.4 } as const satisfies Transition;
/** Вместо полётов и пружин при prefers-reduced-motion: короткое проявление без отскоков. */
export const fade = { type: 'tween', duration: 0.15, ease: 'easeOut' } as const satisfies Transition;

/** Сдвиг между элементами списка и предел: дальше восьмого элемента не ждём. */
export const STAGGER = 0.02;
export const STAGGER_MAX = 8;

/**
 * Куда «доедет» значение после отпускания, если его тормозить трением (UIScrollView.decelerationRate.normal).
 * velocity — px/с, как в PanInfo.
 */
export function project(velocity: number, deceleration = 0.99): number {
  return ((velocity / 1000) * deceleration) / (1 - deceleration);
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Пользователь попросил меньше движения (null до первого чтения — считаем «нет»). */
export function useReduced(): boolean {
  return useReducedMotion() ?? false;
}
