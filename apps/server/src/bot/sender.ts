// Отправка уведомлений из очереди с учётом лимитов MAX (docs/05_max_platform.md):
// не больше 2 сообщений в секунду в один диалог и 30 запросов в секунду на весь API — держим 25 с запасом.
// Временная ошибка (429, 5xx, сеть) — повтор с растущей паузой около 45 минут; окончательная (403 и прочие 4xx) —
// failed. Ответ на /start после таймаута не повторяем: он мог уже дойти.
// Ошибка отправки никогда не доходит до пользовательского запроса: очередь живёт отдельно от API.
import type { Logger } from 'pino';
import type { BotData } from '../db/botData.js';
import { MaxApiError, type MaxApi } from './maxApi.js';
import { REPLY_KINDS, toMessageBody, type QueuedMessage } from './messages.js';

export const PER_CHAT_INTERVAL_MS = 500;
export const GLOBAL_INTERVAL_MS = 40;
/** Паузы 5, 10, 20 … 300 с между попытками дают около 45 минут: сбой MAX или TLS не теряет приглашения. */
export const MAX_ATTEMPTS = 15;
export const BATCH = 10;

/** Тихие часы по Москве (решение Артёма от 27.09): с 22:00 до 9:00 уведомления не шлём, откладываем до утра. */
export const QUIET_HOURS = { from: 22, to: 9 } as const;

const MSK_OFFSET_MS = 3 * 3600_000;

/** Сколько секунд до конца тихих часов; 0 — сейчас не тихие часы. */
export function quietSecondsLeft(nowMs: number, quiet: { from: number; to: number } | null = QUIET_HOURS): number {
  if (!quiet) return 0;
  const msk = new Date(nowMs + MSK_OFFSET_MS);
  const minutes = msk.getUTCHours() * 60 + msk.getUTCMinutes();
  const from = quiet.from * 60;
  const to = quiet.to * 60;
  const inQuiet = from > to ? minutes >= from || minutes < to : minutes >= from && minutes < to;
  if (!inQuiet) return 0;
  const left = (to - minutes + 24 * 60) % (24 * 60);
  return left * 60 - msk.getUTCSeconds();
}

/** Пауза перед повтором: 5, 10, 20, 40… секунд, не больше 5 минут. */
export const retryDelaySec = (attempt: number) => Math.min(5 * 2 ** Math.max(0, attempt - 1), 300);

export interface SenderDeps {
  data: Pick<BotData, 'claimDue' | 'markSent' | 'markRetry' | 'markFailed' | 'defer'>;
  api: Pick<MaxApi, 'sendMessage'>;
  botUsername(): Promise<string>;
  log: Logger;
  /** Тихие часы по Москве; null — выключены. По умолчанию QUIET_HOURS. */
  quietHours?: { from: number; to: number } | null;
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
      const quietLeft = REPLY_KINDS.has(n.kind) ? 0 : quietSecondsLeft(now(), deps.quietHours === undefined ? QUIET_HOURS : deps.quietHours);
      if (quietLeft > 0) {
        // Не ошибка отправки: попытку не тратим
        await deps.data.defer(n.id, 'тихие часы: отложено до 9:00', quietLeft);
        continue;
      }
      try {
        const body = toMessageBody(n.payload as unknown as QueuedMessage, await deps.botUsername());
        await waitSlot(n.maxUserId);
        await deps.api.sendMessage(n.maxUserId, body);
        await deps.data.markSent(n.id);
      } catch (err) {
        const retryable = !(err instanceof MaxApiError) || err.retryable;
        // Ответ на /start или текст после таймаута мог дойти, и повтор пришлёт его второй раз. Дубль ответа хуже
        // потери: человек просто напишет ещё раз. Уведомления повторяем — потерять приглашение с контактом хуже
        const maybeTwice = REPLY_KINDS.has(n.kind) && err instanceof MaxApiError && err.maybeDelivered;
        const retry = retryable && !maybeTwice && n.attempts < MAX_ATTEMPTS;
        const reason = err instanceof MaxApiError ? `${err.status} ${err.code}: ${err.message}` : String(err);
        if (retry) {
          await deps.data.markRetry(n.id, reason, retryDelaySec(n.attempts));
        } else {
          await deps.data.markFailed(n.id, maybeTwice ? `${reason} (ответ мог дойти, не повторяем)` : reason);
        }
        // В лог — id и вид уведомления, без текста: в нём бывают телефоны
        deps.log.warn({ notificationId: n.id, kind: n.kind, attempt: n.attempts, retry, reason }, 'Уведомление не отправлено');
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
