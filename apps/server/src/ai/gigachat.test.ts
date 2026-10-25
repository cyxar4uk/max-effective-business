import { describe, expect, it, vi } from 'vitest';
import { createGigaChat, GigaChatError, GIGACHAT_API_BASE, GIGACHAT_OAUTH_URL } from './gigachat.js';

// Ненастоящий ключ с низкой энтропией: сканер секретов (gitleaks) его не принимает за ключ
const KEY = 'AAAAAAAAAAAAAAAAAAAAAAAA';
const signal = () => AbortSignal.timeout(1000);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeFetch(opts: { oauthStatus?: number; chatStatus?: number; expiresIn?: number; now: () => number }) {
  let n = 0;
  return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const u = String(url);
    if (u === GIGACHAT_OAUTH_URL) {
      n += 1;
      if (opts.oauthStatus) return json({ code: 6, message: 'credentials doesn\'t match db data' }, opts.oauthStatus);
      return json({ access_token: `token-${n}`, expires_at: opts.now() + (opts.expiresIn ?? 30 * 60_000) });
    }
    if (u === `${GIGACHAT_API_BASE}/chat/completions`) {
      if (opts.chatStatus) return json({ message: 'nope' }, opts.chatStatus);
      return json({ choices: [{ message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }] });
    }
    if (u === `${GIGACHAT_API_BASE}/models`) {
      return json({ object: 'list', data: [{ id: 'GigaChat-2', object: 'model' }, { id: 'GigaChat-2-Pro', object: 'model' }, { object: 'model' }] });
    }
    throw new Error(`unexpected ${u}`);
  });
}

describe('GigaChat', () => {
  it('берёт токен по ключу и отправляет запрос с Bearer-токеном', async () => {
    const t = 1_000_000;
    const f = fakeFetch({ now: () => t });
    const ai = createGigaChat({ authKey: KEY, scope: 'GIGACHAT_API_PERS', model: 'GigaChat-2', fetch: f, now: () => t });

    expect(await ai.chat([{ role: 'user', content: 'привет' }], { signal: signal() })).toEqual({ text: '{"ok":true}', finishReason: 'stop' });

    const [oauthUrl, oauthInit] = f.mock.calls[0]!;
    expect(oauthUrl).toBe(GIGACHAT_OAUTH_URL);
    const oh = (oauthInit as RequestInit).headers as Record<string, string>;
    expect(oh.Authorization).toBe(`Basic ${KEY}`);
    expect(oh.RqUID).toMatch(/^[0-9a-f-]{36}$/);
    expect((oauthInit as RequestInit).body).toBe('scope=GIGACHAT_API_PERS');

    const [, chatInit] = f.mock.calls[1]!;
    expect(((chatInit as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    const body = JSON.parse(String((chatInit as RequestInit).body));
    expect(body).toMatchObject({ model: 'GigaChat-2', stream: false, messages: [{ role: 'user', content: 'привет' }] });
  });

  it('держит токен до истечения и обновляет его заранее', async () => {
    let t = 1_000_000;
    const f = fakeFetch({ now: () => t, expiresIn: 30 * 60_000 });
    const ai = createGigaChat({ authKey: KEY, scope: 'GIGACHAT_API_PERS', model: 'GigaChat-2', fetch: f, now: () => t });
    const oauthCalls = () => f.mock.calls.filter(([u]) => String(u) === GIGACHAT_OAUTH_URL).length;

    await ai.chat([{ role: 'user', content: '1' }], { signal: signal() });
    t += 20 * 60_000;
    await ai.chat([{ role: 'user', content: '2' }], { signal: signal() });
    expect(oauthCalls()).toBe(1);

    // За минуту до истечения — уже новый токен
    t += 9 * 60_000 + 1;
    await ai.chat([{ role: 'user', content: '3' }], { signal: signal() });
    expect(oauthCalls()).toBe(2);
  });

  it('одновременные запросы ждут один и тот же токен', async () => {
    const t = 1_000_000;
    const f = fakeFetch({ now: () => t });
    const ai = createGigaChat({ authKey: KEY, scope: 'GIGACHAT_API_PERS', model: 'GigaChat-2', fetch: f, now: () => t });
    await Promise.all([1, 2, 3].map((i) => ai.chat([{ role: 'user', content: String(i) }], { signal: signal() })));
    expect(f.mock.calls.filter(([u]) => String(u) === GIGACHAT_OAUTH_URL)).toHaveLength(1);
  });

  it('отклонённый ключ: ошибка без ключа в тексте, 10 минут за токеном не ходим', async () => {
    let t = 1_000_000;
    const f = fakeFetch({ now: () => t, oauthStatus: 401 });
    const ai = createGigaChat({ authKey: KEY, scope: 'GIGACHAT_API_PERS', model: 'GigaChat-2', fetch: f, now: () => t });

    const err = await ai.chat([{ role: 'user', content: '1' }], { signal: signal() }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GigaChatError);
    expect(err).toMatchObject({ status: 401, stage: 'oauth' });
    expect(String((err as Error).message)).not.toContain(KEY);

    await expect(ai.chat([{ role: 'user', content: '2' }], { signal: signal() })).rejects.toBeInstanceOf(GigaChatError);
    expect(f).toHaveBeenCalledTimes(1);

    t += 10 * 60_000 + 1;
    await expect(ai.chat([{ role: 'user', content: '3' }], { signal: signal() })).rejects.toBeInstanceOf(GigaChatError);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('401 на запросе к модели сбрасывает токен', async () => {
    const t = 1_000_000;
    const f = fakeFetch({ now: () => t, chatStatus: 401 });
    const ai = createGigaChat({ authKey: KEY, scope: 'GIGACHAT_API_PERS', model: 'GigaChat-2', fetch: f, now: () => t });
    await expect(ai.chat([{ role: 'user', content: '1' }], { signal: signal() })).rejects.toMatchObject({ status: 401, stage: 'chat' });
    await expect(ai.chat([{ role: 'user', content: '2' }], { signal: signal() })).rejects.toMatchObject({ stage: 'chat' });
    expect(f.mock.calls.filter(([u]) => String(u) === GIGACHAT_OAUTH_URL)).toHaveLength(2);
  });

  it('список моделей: id с тем же токеном, отклонённый ключ — ошибка на шаге oauth', async () => {
    const t = 1_000_000;
    const f = fakeFetch({ now: () => t });
    const ai = createGigaChat({ authKey: KEY, scope: 'GIGACHAT_API_PERS', model: 'GigaChat-2', fetch: f, now: () => t });
    expect(await ai.models(signal())).toEqual(['GigaChat-2', 'GigaChat-2-Pro']);
    const [url, init] = f.mock.calls[1]!;
    expect(String(url)).toBe(`${GIGACHAT_API_BASE}/models`);
    expect(((init as RequestInit).headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    // Токен из проверки достаётся первому черновику
    await ai.chat([{ role: 'user', content: '1' }], { signal: signal() });
    expect(f.mock.calls.filter(([u]) => String(u) === GIGACHAT_OAUTH_URL)).toHaveLength(1);

    const broken = createGigaChat({ authKey: KEY, scope: 'GIGACHAT_API_PERS', model: 'GigaChat-2', fetch: fakeFetch({ now: () => t, oauthStatus: 401 }), now: () => t });
    await expect(broken.models(signal())).rejects.toMatchObject({ status: 401, stage: 'oauth' });
  });

  it('сеть или таймаут — GigaChatError со статусом 0', async () => {
    const f = vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    const ai = createGigaChat({ authKey: KEY, scope: 'GIGACHAT_API_PERS', model: 'GigaChat-2', fetch: f });
    await expect(ai.chat([{ role: 'user', content: '1' }], { signal: signal() })).rejects.toMatchObject({ status: 0, stage: 'oauth', message: 'Сеть: TimeoutError' });
  });
});
