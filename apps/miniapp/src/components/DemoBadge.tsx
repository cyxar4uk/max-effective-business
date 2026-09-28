/** Пометка тестовой записи (isDemo: true) — обещано жюри в README. */
export function DemoBadge({ isDemo }: { isDemo: boolean }) {
  if (!isDemo) return null;
  return <span className="st demo">тестовые данные</span>;
}
