// Опрос откликов после «Интересно»: один таймер на все места, без React и API — проверяется тестом (invitePoll.test.ts).
import type { Interest } from '../../api/types';

/** Как часто спрашивать сервер и сколько ждать после отклика, мс. */
export const INVITE_POLL_MS = 3000;
export const INVITE_WATCH_MS = 45000;

export interface InviteWatcher {
  /** Ждать приглашения по месту: срок отсчитывается от этого вызова (повторный — продлевает). */
  watch: (placeId: number) => void;
  /** Экран закрыли — больше не спрашиваем (запрос в пути уже ничего не покажет). */
  stop: () => void;
}

interface WatcherOptions {
  load: () => Promise<Interest[]>;
  onInvited: (interest: Interest) => void;
  interval?: number;
  timeout?: number;
  now?: () => number;
}

/**
 * Один таймер на все места: раз в interval — один запрос откликов. Место со статусом invited — в onInvited и из
 * наблюдения; истёк срок — тоже из наблюдения. Ошибка сети — молча ждём следующего раза.
 */
export function createInviteWatcher({
  load,
  onInvited,
  interval = INVITE_POLL_MS,
  timeout = INVITE_WATCH_MS,
  now = Date.now,
}: WatcherOptions): InviteWatcher {
  const until = new Map<number, number>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (timer === null && until.size > 0) timer = setTimeout(tick, interval);
  };

  const tick = async () => {
    timer = null;
    try {
      const items = await load();
      for (const i of items) {
        if (i.status === 'invited' && until.has(i.internship.id)) {
          until.delete(i.internship.id);
          onInvited(i);
        }
      }
    } catch {
      // Нет связи — спросим в следующий раз
    }
    const t = now();
    for (const [id, end] of until) if (t >= end) until.delete(id);
    schedule();
  };

  return {
    watch: (placeId) => {
      until.set(placeId, now() + timeout);
      schedule();
    },
    stop: () => {
      until.clear();
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
