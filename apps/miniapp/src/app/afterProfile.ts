// Место, ради которого студент ушёл заполнять анкету (QR-код на ярмарке, диплинк, «Посмотреть как студент»):
// после согласия и анкеты возвращаем его на это место, а не в колоду. Живёт до конца сессии мини-приложения.

const KEY = 'tandem.afterProfile';

export interface PendingPlace {
  id: number;
  /** Позиция экрана места в истории (history.state.idx): анкета ляжет поверх него, вернуться можно шагами назад. */
  idx: number;
}

/** Запасной вариант, если sessionStorage недоступен. */
let memory: PendingPlace | null = null;

const historyIndex = (): number => (window.history.state as { idx?: number } | null)?.idx ?? 0;

/** Вызывать на экране места, прямо перед переходом к анкете. */
export function rememberPlace(id: number): void {
  memory = { id, idx: historyIndex() };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // Хранилище недоступно — хватит памяти: переходы внутри приложения страницу не перезагружают
  }
}

function isPending(v: unknown): v is PendingPlace {
  const p = v as PendingPlace | null;
  return !!p && Number.isSafeInteger(p.id) && p.id > 0 && Number.isSafeInteger(p.idx) && p.idx >= 0;
}

/** Забрать отложенное место (один раз) или null. */
export function takePlace(): PendingPlace | null {
  let place = memory;
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    if (isPending(stored)) place = stored;
    sessionStorage.removeItem(KEY);
  } catch {
    // см. rememberPlace
  }
  memory = null;
  return place;
}
