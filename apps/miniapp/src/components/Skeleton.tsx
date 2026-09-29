interface SkeletonProps {
  /** Сколько строк-плашек показать. */
  lines?: number;
  height?: number;
}

/** Заглушка на время загрузки: серые плашки вместо контента. */
export function Skeleton({ lines = 3, height = 72 }: SkeletonProps) {
  return (
    <div className="skeleton" role="status" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton-line" style={{ height }} />
      ))}
    </div>
  );
}

/**
 * Экран, пока грузится его чанк: шапка и карточки. Проявляется с задержкой (app.css, .screen-wait) —
 * на быстрой сети его не видно совсем, и экран не мигает.
 */
export function ScreenSkeleton() {
  return (
    <main className="screen screen-wait">
      <div className="skeleton-head" aria-hidden="true" />
      <Skeleton lines={3} height={112} />
    </main>
  );
}
