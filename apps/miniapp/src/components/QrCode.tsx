// QR-код в SVG: генерация на клиенте, без сети (uqr, MIT). Тёмные модули на белом, тихая зона — 4 модуля по стандарту.
import { useMemo } from 'react';
import { encode } from 'uqr';

/** Тихая зона вокруг кода, в модулях (ISO/IEC 18004). */
const QUIET = 4;
/** Цвета кода не зависят от темы: код печатают и сканируют с экрана, ему нужен максимальный контраст. */
const DARK = '#0c0d11';
const LIGHT = '#ffffff';

/** Контур тёмных модулей одной строкой path: соседние модули в ряду сливаются в полосу. */
function modulesPath(data: boolean[][]): string {
  const parts: string[] = [];
  data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      parts.push(`M${start + QUIET} ${y + QUIET}h${x - start}v1h${start - x}z`);
    }
  });
  return parts.join('');
}

interface QrCodeProps {
  value: string;
  /** Подпись для экранного диктора: что за код. */
  label: string;
  className?: string;
}

/**
 * Уровень коррекции — не ниже M (15 %): uqr берёт наименьшую версию кода для M и поднимает коррекцию, если она
 * влезает в ту же версию. Меньше модулей — крупнее каждый модуль на бумаге и на экране, код читается издалека.
 */
export function QrCode({ value, label, className }: QrCodeProps) {
  const { size, path } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', boostEcc: true, border: 0 });
    return { size: qr.size + QUIET * 2, path: modulesPath(qr.data) };
  }, [value]);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={size} height={size} fill={LIGHT} />
      <path d={path} fill={DARK} />
    </svg>
  );
}
