import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { MaxApiError, type NewMessageBody } from './maxApi.js';
import { createSender, GLOBAL_INTERVAL_MS, MAX_ATTEMPTS, PER_CHAT_INTERVAL_MS, quietSecondsLeft, retryDelaySec } from './sender.js';

type Row = { id: number; maxUserId: number; isDemo: boolean; attempts: number; kind: string; payload: Record<string, unknown> };
const row = (id: number, maxUserId: number, over: Partial<Row> = {}): Row => ({
  id, maxUserId, isDemo: false, attempts: 1, kind: 'welcome',
  payload: { text: `m${id}`, buttons: [[{ text: 'Я студент', startapp: 'student' }]] },
  ...over,
});

// 12:00 по Москве — не тихие часы
const NOON_MSK = Date.parse('2026-09-28T09:00:00Z');

function setup(rows: Row[], send: (userId: number, body: NewMessageBody) => Promise<void> = async () => {}, start = NOON_MSK) {
  let clock = start;
  const log: string[] = [];
  const sentAt: { userId: number; t: number; body: NewMessageBody }[] = [];
  const sender = createSender({
    data: {
      claimDue: async () => rows.splice(0) as never,
      markSent: async (id) => void log.push(`sent ${id}`),
      markRetry: async (id, _e, delay) => void log.push(`retry ${id} ${delay}`),
      markFailed: async (id) => void log.push(`failed ${id}`),
      defer: async (id, _r, delay) => void log.push(`defer ${id} ${delay}`),
    },
    api: {
      sendMessage: async (userId, body) => {
        sentAt.push({ userId, t: clock, body });
        await send(userId, body);
      },
    },
    botUsername: async () => 'career_bot',
    log: pino({ level: 'silent' }),
    now: () => clock,
    sleep: async (ms) => void (clock += ms),
  });
  return { sender, log, sentAt };
}

describe('sender', () => {
  it('отправляет с ником бота в кнопках и помечает sent', async () => {
    const { sender, log, sentAt } = setup([row(1, 501)]);
    expect(await sender.tick()).toBe(1);
    expect(log).toEqual(['sent 1']);
    expect(sentAt[0]!.userId).toBe(501);
    expect(sentAt[0]!.body.attachments?.[0]?.payload.buttons[0]?.[0]).toMatchObject({ type: 'open_app', web_app: 'career_bot', payload: 'student' });
  });

  it('в один диалог — не чаще 2 сообщений в секунду, в разные — с общим интервалом', async () => {
    const { sender, sentAt } = setup([row(1, 501), row(2, 501), row(3, 502), row(4, 501)]);
    await sender.tick();
    const toA = sentAt.filter((s) => s.userId === 501).map((s) => s.t);
    for (let i = 1; i < toA.length; i++) expect(toA[i]! - toA[i - 1]!).toBeGreaterThanOrEqual(PER_CHAT_INTERVAL_MS);
    const all = sentAt.map((s) => s.t);
    for (let i = 1; i < all.length; i++) expect(all[i]! - all[i - 1]!).toBeGreaterThanOrEqual(GLOBAL_INTERVAL_MS);
  });

  it('демо-пользователю не отправляет', async () => {
    const { sender, log, sentAt } = setup([row(1, -2001, { isDemo: true })]);
    await sender.tick();
    expect(sentAt).toHaveLength(0);
    expect(log).toEqual(['failed 1']);
  });

  it('429, 5xx и сеть — повтор с растущей паузой; после последней попытки — failed', async () => {
    const errors = [new MaxApiError(429, 'too.many.requests', ''), new MaxApiError(503, 'x', ''), new MaxApiError(0, 'network', '')];
    let i = 0;
    const { sender, log } = setup([row(1, 501, { attempts: 1 }), row(2, 502, { attempts: 3 }), row(3, 503, { attempts: MAX_ATTEMPTS })], async () => {
      throw errors[i++]!;
    });
    await sender.tick();
    expect(log).toEqual([`retry 1 ${retryDelaySec(1)}`, `retry 2 ${retryDelaySec(3)}`, 'failed 3']);
  });

  it('повторы покрывают сбой MAX до 45 минут, а не 75 секунд', () => {
    // Попытка n (attempts = n) после ошибки ставит следующую через retryDelaySec(n); последняя — failed
    const waitSec = Array.from({ length: MAX_ATTEMPTS - 1 }, (_, i) => retryDelaySec(i + 1)).reduce((a, b) => a + b, 0);
    expect(waitSec).toBeGreaterThanOrEqual(45 * 60);
    expect(waitSec).toBeLessThan(60 * 60);
  });

  it('после таймаута ответ на /start не повторяем, уведомление — повторяем', async () => {
    const errors = [
      new MaxApiError(0, 'timeout', ''), // welcome: мог дойти — второй раз не шлём
      new MaxApiError(0, 'network', ''), // fallback: не достучались — повтор
      new MaxApiError(0, 'timeout', ''), // приглашение: потерять хуже, чем прислать дважды
    ];
    let i = 0;
    const { sender, log } = setup([row(1, 501, { kind: 'welcome' }), row(2, 502, { kind: 'fallback' }), row(3, 503, { kind: 'invited_student' })], async () => {
      throw errors[i++]!;
    });
    await sender.tick();
    expect(log).toEqual(['failed 1', `retry 2 ${retryDelaySec(1)}`, `retry 3 ${retryDelaySec(1)}`]);
  });

  it('403 (пользователь остановил бота) — сразу failed, без повторов', async () => {
    const { sender, log } = setup([row(1, 501)], async () => {
      throw new MaxApiError(403, 'chat.denied', 'bot stopped');
    });
    await sender.tick();
    expect(log).toEqual(['failed 1']);
  });

  it('пауза растёт и ограничена 5 минутами', () => {
    expect([1, 2, 3, 4].map(retryDelaySec)).toEqual([5, 10, 20, 40]);
    expect(retryDelaySec(20)).toBe(300);
  });

  it('фоновый цикл останавливается', async () => {
    const { sender } = setup([]);
    const loop = sender.start(1);
    await loop.stop();
  });
});

describe('тихие часы 22:00–9:00 по Москве', () => {
  const at = (iso: string) => Date.parse(iso);

  it('считает, сколько осталось до 9:00', () => {
    expect(quietSecondsLeft(at('2026-09-28T09:00:00Z'))).toBe(0); // 12:00 МСК
    expect(quietSecondsLeft(at('2026-09-28T18:59:00Z'))).toBe(0); // 21:59 МСК
    expect(quietSecondsLeft(at('2026-09-28T19:00:00Z'))).toBe(11 * 3600); // 22:00 МСК
    expect(quietSecondsLeft(at('2026-09-29T05:30:00Z'))).toBe(30 * 60); // 8:30 МСК
    expect(quietSecondsLeft(at('2026-09-29T06:00:00Z'))).toBe(0); // 9:00 МСК
    expect(quietSecondsLeft(at('2026-09-28T19:00:00Z'), null)).toBe(0); // выключены
  });

  it('ночью уведомление откладывается до 9:00, ответ на /start уходит сразу', async () => {
    const night = at('2026-09-28T20:00:00Z'); // 23:00 МСК
    const { sender, log, sentAt } = setup([row(1, 501, { kind: 'internship_match' }), row(2, 502, { kind: 'welcome' })], undefined, night);
    await sender.tick();
    // отложено без траты попытки (defer), а не повтор после ошибки (retry)
    expect(log).toEqual([`defer 1 ${10 * 3600}`, 'sent 2']);
    expect(sentAt.map((s) => s.userId)).toEqual([502]);
  });
});
