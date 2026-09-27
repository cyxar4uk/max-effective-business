import { describe, expect, it } from 'vitest';
import type { EnqueueInput } from '../db/botData.js';
import { createUpdateHandler, replyFor } from './updates.js';

const user = { user_id: 101, first_name: 'Анна', username: 'anna' };

describe('replyFor', () => {
  it('bot_started → приветствие с ключом из пользователя и времени события', () => {
    const r = replyFor({ update_type: 'bot_started', timestamp: 1700000000000, chat_id: 5, user }, true);
    expect(r).toMatchObject({ kind: 'welcome', dedupeKey: 'start:101:1700000000000' });
    expect(r!.message.text).toContain('Анна');
  });

  it('bot_started с payload стажировки — кнопка стажировки', () => {
    const r = replyFor({ update_type: 'bot_started', timestamp: 1, user, payload: 'internship_7' }, false);
    expect(r!.message.buttons[0]![0]!.startapp).toBe('internship_7');
  });

  it('текст в личном диалоге → подсказка; /start текстом → приветствие', () => {
    const msg = (text: string) => ({
      update_type: 'message_created',
      timestamp: 2,
      message: { sender: user, recipient: { chat_type: 'dialog', chat_id: 5 }, body: { mid: 'mid.1', text } },
    });
    expect(replyFor(msg('привет'), false)).toMatchObject({ kind: 'fallback', dedupeKey: 'msg:101:mid.1' });
    expect(replyFor(msg('/start'), false)).toMatchObject({ kind: 'welcome' });
  });

  it('в группе, от бота, без отправителя и прочие события — молчим', () => {
    const base = { update_type: 'message_created', timestamp: 3 };
    expect(replyFor({ ...base, message: { sender: user, recipient: { chat_type: 'chat' }, body: { mid: 'm' } } }, false)).toBeNull();
    expect(replyFor({ ...base, message: { sender: { ...user, is_bot: true }, recipient: { chat_type: 'dialog' }, body: { mid: 'm' } } }, false)).toBeNull();
    expect(replyFor({ ...base, message: { sender: null, recipient: { chat_type: 'dialog' } } }, false)).toBeNull();
    expect(replyFor({ update_type: 'bot_stopped', timestamp: 4, user }, false)).toBeNull();
    expect(replyFor(null, false)).toBeNull();
    expect(replyFor('мусор', false)).toBeNull();
  });
});

describe('createUpdateHandler', () => {
  it('заводит пользователя и ставит ответ в очередь; повторная доставка вебхука даёт тот же ключ', async () => {
    const queued: EnqueueInput[] = [];
    const upserted: number[] = [];
    const handle = createUpdateHandler({
      upsertUser: async (u) => (upserted.push(u.id), { id: 9 }),
      enqueue: async (n) => (queued.push(n), true),
      demo: true,
    });
    const update = { update_type: 'bot_started', timestamp: 10, user };
    await handle(update);
    await handle(update);

    expect(upserted).toEqual([101, 101]);
    expect(queued).toHaveLength(2);
    expect(queued[0]).toMatchObject({ userId: 9, kind: 'welcome', dedupeKey: 'start:101:10' });
    expect(queued[1]!.dedupeKey).toBe(queued[0]!.dedupeKey);
  });

  it('на неинтересное обновление ничего не пишет в БД', async () => {
    let calls = 0;
    const handle = createUpdateHandler({ upsertUser: async () => (calls++, { id: 1 }), enqueue: async () => (calls++, true), demo: false });
    await handle({ update_type: 'message_removed', timestamp: 1 });
    expect(calls).toBe(0);
  });
});
