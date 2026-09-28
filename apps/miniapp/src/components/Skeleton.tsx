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
