// Крупная надпись обложки карточки места, вписанная в оставшееся место: лента студента и превью в форме места.
import { useLayoutEffect, useRef } from 'react';

/** Размер крупной надписи обложки: как в макете — 44 px, в тесноте не меньше 20 px. */
const LABEL_MAX = 44;
const LABEL_MIN = 20;

/**
 * Крупная надпись обложки, вписанная в свой блок. Размер блока задаёт родитель: в карточке места это .card-cv
 * в app.css — место между плашками и текстом. Берём самый крупный размер от 44 до 20 px, при котором надпись
 * помещается по высоте и по ширине. Слова не рвутся, перенос — только по мягкому переносу.
 * Не помещается и в 20 px — скрыта. Пересчёт — при смене размера блока и после загрузки шрифтов.
 */
export function FitLabel({ label, className }: { label: string; className: string }) {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const b = box.current;
    const t = text.current;
    if (!b || !t) return;
    const fits = (px: number) => {
      t.style.fontSize = `${px}px`;
      return t.offsetHeight <= b.clientHeight && t.scrollWidth <= t.clientWidth;
    };
    const fit = () => {
      let lo = LABEL_MIN;
      let hi = LABEL_MAX;
      let best = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (fits(mid)) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      t.style.fontSize = `${best || LABEL_MIN}px`;
      t.style.visibility = best ? '' : 'hidden';
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(b);
    document.fonts.addEventListener('loadingdone', fit);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', fit);
    };
  }, [label]);

  return (
    <div ref={box} className={className} aria-hidden="true">
      <div ref={text} className="cv-label" lang="ru">
        {label}
      </div>
    </div>
  );
}
