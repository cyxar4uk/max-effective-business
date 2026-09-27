// Обработка обновлений MAX Bot API из вебхука. Быстро и идемпотентно: ответ не отправляется здесь,
// а ставится в очередь с ключом из id события — повторная доставка вебхука не создаст второе сообщение.
import type { EnqueueInput } from '../db/botData.js';
import type { MaxUser } from '../auth/initData.js';
import { fallbackMessage, welcomeMessage, type QueuedMessage } from './messages.js';

export interface UpdateDeps {
  upsertUser(maxUser: MaxUser): Promise<{ id: number }>;
  enqueue(n: EnqueueInput): Promise<boolean>;
  demo: boolean;
}

interface MaxApiUser {
  user_id: number;
  first_name?: string;
  last_name?: string | null;
  username?: string | null;
  is_bot?: boolean;
}

// Поля из схемы: BotStartedUpdate, MessageCreatedUpdate — https://github.com/max-messenger/api-schema
type Update =
  | { update_type: 'bot_started'; timestamp: number; user: MaxApiUser; payload?: string | null }
  | {
      update_type: 'message_created';
      timestamp: number;
      message: { sender?: MaxApiUser | null; recipient: { chat_type?: string }; body?: { mid?: string; text?: string | null } | null };
    }
  | { update_type: string; timestamp?: number };

const toMaxUser = (u: MaxApiUser): MaxUser => ({
  id: u.user_id,
  first_name: u.first_name,
  last_name: u.last_name ?? undefined,
  username: u.username ?? undefined,
});

/** Что ответить на обновление: получатель, сообщение, ключ идемпотентности. null — не отвечаем. */
export function replyFor(raw: unknown, demo: boolean): { user: MaxApiUser; kind: string; dedupeKey: string; message: QueuedMessage } | null {
  const update = raw as Update;
  if (!update || typeof update !== 'object') return null;

  if (update.update_type === 'bot_started' && 'user' in update && update.user?.user_id) {
    return {
      user: update.user,
      kind: 'welcome',
      dedupeKey: `start:${update.user.user_id}:${update.timestamp}`,
      message: welcomeMessage({ firstName: update.user.first_name, demo, startPayload: update.payload }),
    };
  }

  if (update.update_type === 'message_created' && 'message' in update) {
    const { sender, recipient, body } = update.message;
    // Только личный диалог с живым человеком: в группах и от других ботов молчим
    if (!sender?.user_id || sender.is_bot || recipient?.chat_type !== 'dialog') return null;
    const id = body?.mid ?? String(update.timestamp);
    const isStart = (body?.text ?? '').trim().startsWith('/start');
    return {
      user: sender,
      kind: isStart ? 'welcome' : 'fallback',
      dedupeKey: `msg:${sender.user_id}:${id}`,
      message: isStart ? welcomeMessage({ firstName: sender.first_name, demo }) : fallbackMessage(),
    };
  }

  return null;
}

export function createUpdateHandler(deps: UpdateDeps) {
  return async (raw: unknown): Promise<void> => {
    const reply = replyFor(raw, deps.demo);
    if (!reply) return;
    // Пользователь мог ещё не открывать мини-приложение: заводим запись, чтобы было кому ставить уведомление
    const user = await deps.upsertUser(toMaxUser(reply.user));
    await deps.enqueue({ userId: user.id, kind: reply.kind, dedupeKey: reply.dedupeKey, payload: { ...reply.message } });
  };
}
