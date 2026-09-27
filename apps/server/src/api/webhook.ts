import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { ApiError } from './errors.js';

// Приём обновлений MAX Bot API по вебхуку — https://dev.max.ru/docs-api/methods/POST/subscriptions
// Платформа шлёт POST на https://<домен>:443/bot/webhook с заголовком X-Max-Bot-Api-Secret и ждёт 200 за 30 секунд,
// иначе повторяет до 10 раз за 8 часов. Поэтому обработчик бота должен быть быстрым и идемпотентным.
// Здесь только проверка секрета; разбор обновлений — модуль bot (Тимур).

export const WEBHOOK_PATH = '/bot/webhook';
export const WEBHOOK_SECRET_HEADER = 'x-max-bot-api-secret';

export type UpdateHandler = (update: unknown) => void | Promise<void>;

function sameSecret(received: string | undefined, expected: string): boolean {
  if (!received) return false;
  // Сравниваем хеши: timingSafeEqual требует одинаковой длины, а длину секрета раскрывать не хотим
  const a = createHash('sha256').update(received).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function webhookRouter(opts: { secret: string; onUpdate: UpdateHandler }): Router {
  const r = Router();
  r.post(WEBHOOK_PATH, async (req, res) => {
    if (!sameSecret(req.get(WEBHOOK_SECRET_HEADER), opts.secret)) throw new ApiError('UNAUTHORIZED', 'Неверный секрет вебхука');
    // Ошибка обработчика → 500, и MAX повторит доставку позже
    await opts.onUpdate(req.body);
    res.json({ ok: true });
  });
  return r;
}
