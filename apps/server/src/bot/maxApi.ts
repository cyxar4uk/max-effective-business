// Тонкий клиент MAX Bot API: только методы, сверенные с документацией (docs/05_max_platform.md).
// Своя обёртка над fetch вместо SDK: вебхук принимает сервер Андрея, а боту нужны два метода — GET /me и POST /messages.

export const MAX_API_BASE = 'https://platform-api2.max.ru';

/** Кнопка inline-клавиатуры. Схема: OpenAppButton, LinkButton — https://github.com/max-messenger/api-schema */
export type Button =
  | { type: 'open_app'; text: string; web_app: string; payload?: string }
  | { type: 'link'; text: string; url: string };

/** Тело сообщения — NewMessageBody. text до 4000 символов. */
export interface NewMessageBody {
  text: string;
  format?: 'markdown' | 'html';
  notify?: boolean;
  attachments?: { type: 'inline_keyboard'; payload: { buttons: Button[][] } }[];
}

export class MaxApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MaxApiError';
  }

  /** Стоит ли повторить: превышен лимит, ошибка сервера, сеть или таймаут (status 0). */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export interface MaxApi {
  getMe(): Promise<{ userId: number; username: string | null }>;
  sendMessage(userId: number, body: NewMessageBody): Promise<void>;
}

export function createMaxApi(opts: { token: string; baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch }): MaxApi {
  const base = opts.baseUrl ?? MAX_API_BASE;
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        // Токен — сам по себе, без префикса Bearer
        headers: { Authorization: opts.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new MaxApiError(0, 'network', err instanceof Error ? err.message : String(err));
    }
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const e = (data ?? {}) as { code?: unknown; message?: unknown };
      throw new MaxApiError(res.status, typeof e.code === 'string' ? e.code : 'http_error', typeof e.message === 'string' ? e.message : `HTTP ${res.status}`);
    }
    return data;
  }

  return {
    async getMe() {
      const me = (await call('GET', '/me')) as { user_id: number; username?: string | null };
      return { userId: me.user_id, username: me.username ?? null };
    },
    async sendMessage(userId, body) {
      await call('POST', `/messages?user_id=${encodeURIComponent(String(userId))}`, body);
    },
  };
}
