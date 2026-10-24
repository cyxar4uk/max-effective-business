// История переходов внутри мини-приложения: где мы в ней и какие адреса позади. Кнопка «Назад» MAX ходит по ней,
// поэтому переходы «на главный» и «к местам» не должны плодить дубли: «Назад» с главного вела бы снова на главный.
import type { NavigateFunction } from 'react-router';

/** Позиция в истории: BrowserRouter хранит её в history.state.idx. */
export const historyIndex = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

/** Вкладки студента: между ними ходят заменой записи (StudentShell), и весь раздел — одна запись в истории. */
export const STUDENT_TABS: readonly string[] = ['/student', '/student/interests', '/student/profile'];

/** Адрес (pathname) каждой записи истории по её позиции. Записи после текущей не смотрим: их стирает следующий переход. */
const entries: string[] = [];

/** Запомнить адрес текущей записи. Зовёт BackButtonSync на каждой смене адреса. */
export function rememberEntry(pathname: string): void {
  entries[historyIndex()] = pathname;
}

/**
 * Перейти на `pathname` без дубля в истории.
 * - Такой адрес есть позади — вернуться к ближайшему, как «Назад».
 * - Позади запись того же раздела (`section`, например другая вкладка студента) — вернуться к ней и заменить её адрес:
 *   «К местам» с места, открытого из «Откликов», не оставляет «Отклики» в истории под лентой.
 * - Ничего такого нет (или страницу перезагрузили, и прошлые адреса неизвестны) — заменить текущую запись.
 */
export function backTo(navigate: NavigateFunction, pathname: string, section: readonly string[] = [pathname]): void {
  const idx = historyIndex();
  for (let k = idx - 1; k >= 0; k--) {
    const entry = entries[k];
    if (entry === undefined || (entry !== pathname && !section.includes(entry))) continue;
    if (entry !== pathname) {
      // Возврат по истории асинхронный: заменяем адрес, когда роутер уже на той записи
      window.addEventListener('popstate', () => navigate(pathname, { replace: true }), { once: true });
    }
    navigate(k - idx);
    return;
  }
  navigate(pathname, { replace: true });
}
