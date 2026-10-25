import { pino } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { GigaChatError, type GigaChat } from './gigachat.js';
import { checkGigaChat } from './index.js';

const log = pino({ level: 'silent' });
const fakeAi = (models: GigaChat['models']): GigaChat => ({ chat: vi.fn(async () => ({ text: '', finishReason: null })), models: vi.fn(models) });

describe('checkGigaChat: ключ при старте', () => {
  it('ключ принят и модель есть — true', async () => {
    expect(await checkGigaChat(fakeAi(async () => ['GigaChat-2', 'GigaChat-2-Pro']), 'GigaChat-2-Pro', log)).toBe(true);
  });

  it('модели нет в списке — false', async () => {
    expect(await checkGigaChat(fakeAi(async () => ['GigaChat-2']), 'GigaChat-2-Max', log)).toBe(false);
  });

  it('ключ отклонён или сеть — false, а не падение сервера', async () => {
    const rejected = fakeAi(async () => {
      throw new GigaChatError(401, 'oauth', 'Токен GigaChat: HTTP 401');
    });
    expect(await checkGigaChat(rejected, 'GigaChat-2', log)).toBe(false);
    const offline = fakeAi(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await checkGigaChat(offline, 'GigaChat-2', log)).toBe(false);
  });
});
