interface DemoBadgeProps {
  isDemo: boolean | undefined;
  /** Что помечаем: место или компания — «тестовые данные», отклик кандидата — «тестовый отклик». */
  kind?: 'data' | 'response';
  /** На тёмной обложке карточки — плотная плашка (как .gchip), на поверхности — обычная (.st). */
  onCover?: boolean;
}

/**
 * Пометка тестовой записи (isDemo: true) — обещано жюри в README. Одна на всё приложение:
 * лента, подробно, отклики, места, кандидаты, «Это тандем!».
 */
export function DemoBadge({ isDemo, kind = 'data', onCover = false }: DemoBadgeProps) {
  if (!isDemo) return null;
  return <span className={onCover ? 'gchip demo' : 'st demo'}>{kind === 'response' ? 'тестовый отклик' : 'тестовые данные'}</span>;
}
