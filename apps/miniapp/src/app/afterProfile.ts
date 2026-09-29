// Место, ради которого студент ушёл заполнять анкету (QR-код на ярмарке, диплинк, «Поделиться» друга):
// после согласия и анкеты возвращаем его на это место, а не в колоду. Живёт до конца сессии мини-приложения.

const KEY = 'tandem.afterProfile';

/** Запасной вариант, если sessionStorage недоступен. */
let memory: number | null = null;

export function rememberPlace(id: number): void {
  memory = id;
  try {
    sessionStorage.setItem(KEY, String(id));
  } catch {
    // Хранилище недоступно — хватит памяти: переходы внутри приложения страницу не перезагружают
  }
}

/** Забрать отложенное место (один раз): id или null. */
export function takePlace(): number | null {
  let id = memory;
  try {
    const stored = Number(sessionStorage.getItem(KEY));
    if (Number.isSafeInteger(stored) && stored > 0) id = stored;
    sessionStorage.removeItem(KEY);
  } catch {
    // см. rememberPlace
  }
  memory = null;
  return id;
}
