import { useCallback, useRef } from 'react';

/**
 * Ряд, который прокручивается вбок: у края, за которым есть ещё, — растворение (классы fade-l / fade-r).
 * Без него последний чип, срезанный краем экрана, выглядит как обрезанный текст, а не как «листайте дальше».
 */
export function useEdgeFade<T extends HTMLElement>(): (el: T | null) => void {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle('fade-l', el.scrollLeft > 1);
      el.classList.toggle('fade-r', max - el.scrollLeft > 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // Чипы приходят после загрузки и меняют ширину при выборе — пересчитываем по размеру ряда и его содержимого
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    const mo = new MutationObserver(() => {
      for (const child of el.children) ro.observe(child);
      update();
    });
    mo.observe(el, { childList: true });
    cleanup.current = () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
}
