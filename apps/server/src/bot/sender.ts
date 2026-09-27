// Отправка уведомлений из очереди с учётом лимитов MAX (docs/05_max_platform.md):
// не больше 2 сообщений в секунду в один диалог и 30 запросов в секунду на весь API — держим 25 с запасом.
// Временная ошибка (429, 5xx, сеть) — повтор с растущей паузой; окончательная (403 и прочие 4xx) — failed.
// Ошибка отправки никогда не доходит до пользовательского запроса: очередь живёт отдельно от API.
import type { Logger } from 'pino';
import type { BotData } from '../db/botData.js';
import { MaxApiError, type MaxApi } from './maxApi.js';
import { toMessageBody, type QueuedMessage } from './messages.js';

export const PER_CHAT_INTERVAL_MS = 500;
export const GLOBAL_INTERVAL_MS = 40;
export const MAX_ATTEMPTS = 5;
export const BATCH = 10;

/** Пауза перед повтором: 5, 10, 20, 40… секунд, не больше 5 минут. */
export const retryDelaySec = (attempt: number) => Math.min(5 * 2 ** Math.max(0, attempt - 1), 300);

export interface SenderDeps {
  data: Pick<BotData, 'claimDue' | 'markSent' | 'markRetry' | 'markFailed'>;
  api: Pick<MaxApi, 'sendMessage'>;
  botUsername(): Promise<string>;
  log: Logger;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createSender(deps: SenderDeps) {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const lastByChat = new Map<number, number>();
  let lastAny = 0;

  async function waitSlot(maxUserId: number): Promise<void> {
    const t = now();
    const ready = Math.max((lastByChat.get(maxUserId) ?? 0) + PER_CHAT_INTERVAL_MS, lastAny + GLOBAL_INTERVAL_MS);
    if (ready > t) await sleep(ready - t);
    lastAny = now();
    lastByChat.set(maxUserId, lastAny);
  }

  /** Один проход по очереди. Возвращает число обработанных записей. */
  async function tick(): Promise<number> {
    const due = await deps.data.claimDue(BATCH);
    for (const n of due) {
      if (n.isDemo || n.maxUserId <= 0) {
        await deps.data.markFailed(n.id, 'демо-пользователь: не настоящий аккаунт MAX');
        continue;
      }
      try {
        const body = toMessageBody(n.payload as unknown as QueuedMessage, await deps.botUsername());
        await waitSlot(n.maxUserId);
        await deps.api.sendMessage(n.maxUserId, body);
        await deps.data.markSent(n.id);
      } catch (err) {
        const retryable = !(err instanceof MaxApiError) || err.retryable;
        const reason = err instanceof MaxApiError ? `${err.status} ${err.code}: ${err.message}` : String(err);
        if (retryable && n.attempts < MAX_ATTEMPTS) {
          await deps.data.markRetry(n.id, reason, retryDelaySec(n.attempts));
        } else {
          await deps.data.markFailed(n.id, reason);
        }
        // В лог — id и вид уведомления, без текста: в нём бывают телефоны
        deps.log.warn({ notificationId: n.id, kind: n.kind, attempt: n.attempts, retry: retryable && n.attempts < MAX_ATTEMPTS, reason }, 'Уведомление не отправлено');
      }
    }
    return due.length;
  }

  /** Фоновый цикл: пока очередь не пуста — сразу следующий проход, иначе пауза. */
  function start(idleMs = 1000): { stop(): Promise<void> } {
    let running = true;
    const loop = (async () => {
      while (running) {
        let handled = 0;
        try {
          handled = await tick();
        } catch (err) {
          deps.log.error({ err }, 'Ошибка очереди уведомлений');
        }
        if (running && handled < BATCH) await sleep(idleMs);
      }
    })();
    return {
      async stop() {
        running = false;
        await loop;
      },
    };
  }

  return { tick, start };
}
