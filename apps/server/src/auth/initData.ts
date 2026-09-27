import { createHmac, timingSafeEqual } from 'node:crypto';

// Проверка подписи initData мини-приложения MAX.
// Алгоритм: https://dev.max.ru/docs/webapps/validation (сверено 27.09.2026)
//   secret = HMAC_SHA256(key = "WebAppData", message = BOT_TOKEN)
//   hash   = hex(HMAC_SHA256(key = secret, message = отсортированные "key=value" через \n, без hash))

export interface MaxUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface InitData {
  user: MaxUser;
  authDate: Date;
  startParam?: string;
  queryId?: string;
}

export type InitDataError = 'MISSING' | 'MALFORMED' | 'BAD_SIGNATURE' | 'EXPIRED' | 'NO_USER';

export type ValidationResult = { ok: true; data: InitData } | { ok: false; error: InitDataError };

function parsePairs(raw: string, plusAsSpace = false): Map<string, string> | null {
  const pairs = new Map<string, string>();
  for (const part of raw.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq <= 0) return null;
    const key = part.slice(0, eq);
    try {
      const value = part.slice(eq + 1);
      pairs.set(key, decodeURIComponent(plusAsSpace ? value.replace(/\+/g, ' ') : value));
    } catch {
      return null;
    }
  }
  return pairs;
}

export function dataCheckString(pairs: Map<string, string>): string {
  return [...pairs.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export function signDataCheckString(checkString: string, botToken: string): string {
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secret).update(checkString).digest('hex');
}

// auth_date в секундах; на случай миллисекунд различаем по порядку величины
function parseAuthDate(value: string | undefined): Date | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return new Date(n > 1e12 ? n : n * 1000);
}

export function validateInitData(
  raw: string | undefined,
  botToken: string,
  opts: { maxAgeSec: number; now?: Date },
): ValidationResult {
  if (!raw) return { ok: false, error: 'MISSING' };

  let pairs = parsePairs(raw);
  const hash = pairs?.get('hash');
  if (!pairs || !hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, error: 'MALFORMED' };

  const received = Buffer.from(hash.toLowerCase(), 'hex');
  const signatureMatches = (p: Map<string, string>) => {
    const expected = Buffer.from(signDataCheckString(dataCheckString(p), botToken), 'hex');
    return expected.length === received.length && timingSafeEqual(expected, received);
  };
  if (!signatureMatches(pairs)) {
    // Документация MAX не уточняет, как кодируются пробелы. Если клиент закодировал их как «+» (form-encoding),
    // строгий decodeURIComponent их не раскроет. Второй вариант тоже требует подписи токеном бота.
    const alt = raw.includes('+') ? parsePairs(raw, true) : null;
    if (!alt || !signatureMatches(alt)) return { ok: false, error: 'BAD_SIGNATURE' };
    pairs = alt;
  }

  const authDate = parseAuthDate(pairs.get('auth_date'));
  if (!authDate) return { ok: false, error: 'MALFORMED' };
  const now = opts.now ?? new Date();
  const ageSec = (now.getTime() - authDate.getTime()) / 1000;
  // Небольшой допуск на расхождение часов в обе стороны
  if (ageSec > opts.maxAgeSec || ageSec < -300) return { ok: false, error: 'EXPIRED' };

  let user: MaxUser;
  try {
    user = JSON.parse(pairs.get('user') ?? '') as MaxUser;
  } catch {
    return { ok: false, error: 'NO_USER' };
  }
  if (!user || typeof user.id !== 'number' || !Number.isSafeInteger(user.id)) return { ok: false, error: 'NO_USER' };

  return {
    ok: true,
    data: {
      user,
      authDate,
      startParam: pairs.get('start_param'),
      queryId: pairs.get('query_id'),
    },
  };
}

// Сборка подписанного initData. Нужна тестам и скрипту режима разработки.
export function buildInitData(fields: Record<string, string>, botToken: string): string {
  const pairs = new Map(Object.entries(fields));
  const hash = signDataCheckString(dataCheckString(pairs), botToken);
  const all: [string, string][] = [...pairs.entries(), ['hash', hash]];
  return all
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}
