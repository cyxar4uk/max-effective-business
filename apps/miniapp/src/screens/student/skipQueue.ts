// Отложенные пропуски мест. «Не интересно» не уходит на сервер сразу: сервер навсегда убирает из ленты место с любым
// откликом, а отменить пропуск API не умеет. Поэтому пропуск ждёт несколько секунд, и «Вернуть» за это время просто
// забирает его из очереди — как отказ кандидату у работодателя (employer/useDecision.ts). Уход с экрана, сворачивание
// и закрытие мини-приложения отправляют всё отложенное сразу.

/** Отправить пропуск места. keepalive — запрос доживёт до сервера, даже если мини-приложение закрывают. */
export type SendSkip = (placeId: number, keepalive: boolean) => Promise<unknown>;

export interface SkipQueue {
  /** Отложить пропуск: уйдёт на сервер через delayMs, если его не вернут. */
  add: (placeId: number) => void;
  /** «Вернуть»: забрать пропуск из очереди. false — его уже отправили. */
  remove: (placeId: number) => boolean;
  /** Отправить все отложенные пропуски сейчас же. true — было что отправлять. */
  flush: (keepalive: boolean) => boolean;
  /**
   * Ответы на отправленные пропуски пришли (с ошибкой или без) — после этого ленту можно грузить заново, пропущенные
   * места в неё не вернутся. Не дольше maxMs: повисший запрос не должен держать ленту на заглушке.
   */
  settled: (maxMs: number) => Promise<void>;
  /** Узнавать об отправленных пропусках: колода убирает их из «Вернуть». Возвращает отписку. */
  subscribe: (listener: (placeIds: number[]) => void) => () => void;
}

export function createSkipQueue(send: SendSkip, delayMs: number): SkipQueue {
  // Map хранит порядок добавления: при уходе пропуски уходят в том порядке, в каком их сделали
  const queued = new Map<number, ReturnType<typeof setTimeout>>();
  const inflight = new Set<Promise<unknown>>();
  const listeners = new Set<(placeIds: number[]) => void>();

  const sendNow = (ids: number[], keepalive: boolean) => {
    for (const id of ids) {
      clearTimeout(queued.get(id));
      queued.delete(id);
    }
    // Запросы — синхронно, прямо из обработчика ухода: при закрытии мини-приложения отложенный вызов может не успеть.
    // Синхронный throw из send тоже превращаем в отказ: остальные пропуски всё равно должны уйти.
    // Ошибку пропуска не показываем: место просто снова придёт в ленте, а экран, где пропустили, может быть уже закрыт
    const call = (id: number): Promise<unknown> => {
      try {
        return send(id, keepalive);
      } catch (err) {
        return Promise.reject(err);
      }
    };
    const batch = Promise.allSettled(ids.map(call));
    inflight.add(batch);
    void batch.then(() => inflight.delete(batch));
    for (const listener of [...listeners]) listener(ids);
  };

  return {
    add: (placeId) => {
      clearTimeout(queued.get(placeId));
      queued.delete(placeId);
      queued.set(placeId, setTimeout(() => sendNow([placeId], false), delayMs));
    },
    remove: (placeId) => {
      if (!queued.has(placeId)) return false;
      clearTimeout(queued.get(placeId));
      queued.delete(placeId);
      return true;
    },
    flush: (keepalive) => {
      if (queued.size === 0) return false;
      sendNow([...queued.keys()], keepalive);
      return true;
    },
    settled: (maxMs) =>
      Promise.race([
        Promise.allSettled([...inflight]).then(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, maxMs)),
      ]),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
