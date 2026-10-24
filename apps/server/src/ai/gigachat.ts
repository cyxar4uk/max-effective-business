// Тонкий клиент GigaChat (Сбер): токен OAuth и chat/completions. Данные не уходят за рубеж.
// Свой fetch вместо SDK — нужны два запроса. Сертификаты Сбера выпустил центр Минцифры: корень добавляет
// trustRussianRootCa() при старте сервера (src/tls/russianRootCa.ts); проверку TLS не отключаем.
// Ключ авторизации живёт только здесь, в заголовке запроса за токеном: в логи, ошибки и ответы API он не попадает.
import { randomUUID } from 'node:crypto';

export const GIGACHAT_OAUTH_URL = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
export const GIGACHAT_API_BASE = 'https://gigachat.devices.sberbank.ru/api/v1';

export type GigaChatScope = 'GIGACHAT_API_PERS' | 'GIGACHAT_API_B2B' | 'GIGACHAT_API_CORP';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class GigaChatError extends Error {
  constructor(
    /** Код HTTP; 0 — сеть или таймаут. */
    readonly status: number,
    /** На каком шаге: токен или ответ модели. */
    readonly stage: 'oauth' | 'chat',
    message: string,
  ) {
    super(message);
    this.name = 'GigaChatError';
  }
}

export interface GigaChat {
  /** Текст ответа модели. signal — общий срок на токен и ответ. */
  chat(messages: ChatMessage[], opts: { signal: AbortSignal; temperature?: number; maxTokens?: number }): Promise<string>;
}

export interface GigaChatOptions {
  /** Authorization key из личного кабинета Studio: base64(client_id:client_secret). */
  authKey: string;
  scope: GigaChatScope;
  model: string;
  fetch?: typeof fetch;
  now?: () => number;
  oauthUrl?: string;
  apiBase?: string;
}

/** Токен живёт 30 минут; обновляем заранее, чтобы он не истёк посреди запроса. */
const TOKEN_MARGIN_MS = 60_000;
/** Ключ отклонён (401/403 на токене) — столько не ходим за токеном: каждый запрос всё равно упадёт. */
const AUTH_BROKEN_MS = 10 * 60_000;

export function createGigaChat(opts: GigaChatOptions): GigaChat {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const oauthUrl = opts.oauthUrl ?? GIGACHAT_OAUTH_URL;
  const apiBase = opts.apiBase ?? GIGACHAT_API_BASE;

  let token: { value: string; expiresAt: number } | null = null;
  // Один запрос за токеном на всех, кто пришёл одновременно
  let pending: Promise<string> | null = null;
  let authBrokenUntil = 0;

  async function fetchToken(signal: AbortSignal): Promise<string> {
    if (now() < authBrokenUntil) throw new GigaChatError(401, 'oauth', 'Ключ GigaChat отклонён недавно, повтор позже');
    let res: Response;
    try {
      res = await doFetch(oauthUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          RqUID: randomUUID(),
          Authorization: `Basic ${opts.authKey}`,
        },
        body: new URLSearchParams({ scope: opts.scope }).toString(),
        signal,
      });
    } catch (err) {
      throw new GigaChatError(0, 'oauth', `Сеть: ${errName(err)}`);
    }
    if (!res.ok) {
      if (res.status === 400 || res.status === 401 || res.status === 403) authBrokenUntil = now() + AUTH_BROKEN_MS;
      throw new GigaChatError(res.status, 'oauth', `Токен GigaChat: HTTP ${res.status}`);
    }
    const data = (await res.json().catch(() => null)) as { access_token?: unknown; expires_at?: unknown } | null;
    if (typeof data?.access_token !== 'string' || !data.access_token) throw new GigaChatError(res.status, 'oauth', 'Токен GigaChat: пустой ответ');
    // expires_at — мс с эпохи; если его нет, считаем по документации: 30 минут
    const expiresAt = typeof data.expires_at === 'number' ? data.expires_at : now() + 30 * 60_000;
    token = { value: data.access_token, expiresAt };
    return token.value;
  }

  async function accessToken(signal: AbortSignal): Promise<string> {
    if (token && token.expiresAt - TOKEN_MARGIN_MS > now()) return token.value;
    pending ??= fetchToken(signal).finally(() => {
      pending = null;
    });
    return pending;
  }

  return {
    async chat(messages, { signal, temperature = 0.1, maxTokens = 600 }) {
      const bearer = await accessToken(signal);
      let res: Response;
      try {
        res = await doFetch(`${apiBase}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${bearer}` },
          body: JSON.stringify({ model: opts.model, messages, temperature, max_tokens: maxTokens, stream: false }),
          signal,
        });
      } catch (err) {
        throw new GigaChatError(0, 'chat', `Сеть: ${errName(err)}`);
      }
      // Токен отозвали раньше срока — следующий запрос возьмёт новый
      if (res.status === 401) token = null;
      if (!res.ok) throw new GigaChatError(res.status, 'chat', `Ответ GigaChat: HTTP ${res.status}`);
      const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new GigaChatError(res.status, 'chat', 'Ответ GigaChat без текста');
      return content;
    },
  };
}

// Только имя ошибки (TimeoutError, AbortError, TypeError): текст может содержать адрес и детали запроса
function errName(err: unknown): string {
  if (err instanceof Error) return (err.cause as { code?: string } | undefined)?.code ?? err.name;
  return 'unknown';
}
