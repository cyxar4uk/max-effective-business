import { describe, expect, it } from 'vitest';
import { createMaxApi, MaxApiError } from './maxApi.js';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('createMaxApi', () => {
  it('POST /messages: домен platform-api2, user_id в query, токен в Authorization без Bearer', async () => {
    const f = fakeFetch(200, { message: {} });
    await createMaxApi({ token: 'tok', fetch: f.fn }).sendMessage(42, { text: 'Привет' });
    expect(f.calls[0]!.url).toBe('https://platform-api2.max.ru/messages?user_id=42');
    expect(f.calls[0]!.init.method).toBe('POST');
    expect(f.calls[0]!.init.headers).toMatchObject({ Authorization: 'tok', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ text: 'Привет' });
  });

  it('GET /me отдаёт id и ник бота', async () => {
    const f = fakeFetch(200, { user_id: 7, username: 'career_bot', is_bot: true });
    expect(await createMaxApi({ token: 'tok', fetch: f.fn }).getMe()).toEqual({ userId: 7, username: 'career_bot' });
    expect(f.calls[0]!.url).toBe('https://platform-api2.max.ru/me');
  });

  it('ошибка API → MaxApiError с кодом и признаком повтора', async () => {
    const api403 = createMaxApi({ token: 't', fetch: fakeFetch(403, { code: 'chat.denied', message: 'bot stopped' }).fn });
    const err = await api403.sendMessage(1, { text: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MaxApiError);
    expect(err).toMatchObject({ status: 403, code: 'chat.denied', retryable: false });

    const api429 = createMaxApi({ token: 't', fetch: fakeFetch(429, {}).fn });
    expect(await api429.sendMessage(1, { text: 'x' }).catch((e: unknown) => e)).toMatchObject({ status: 429, retryable: true });

    const api503 = createMaxApi({ token: 't', fetch: fakeFetch(503, null).fn });
    expect(await api503.sendMessage(1, { text: 'x' }).catch((e: unknown) => e)).toMatchObject({ status: 503, retryable: true });
  });

  it('сеть недоступна → status 0, можно повторить', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const err = await createMaxApi({ token: 't', fetch: failing }).sendMessage(1, { text: 'x' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 0, code: 'network', retryable: true, maybeDelivered: false });
  });

  it('таймаут → status 0, можно повторить, но запрос мог дойти', async () => {
    const slow = (async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }) as unknown as typeof fetch;
    const err = await createMaxApi({ token: 't', fetch: slow }).sendMessage(1, { text: 'x' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 0, code: 'timeout', retryable: true, maybeDelivered: true });
  });
});
