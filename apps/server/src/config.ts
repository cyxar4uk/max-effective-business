import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

// Пустая переменная (compose подставляет "" для незаданных) — то же, что её отсутствие
const emptyAsUndefined = (v: unknown) => (v === '' ? undefined : v);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1),
  RUN_MIGRATIONS: bool.default(true),
  SEED_DEMO: bool.default(false),

  MAX_BOT_TOKEN: z.string().min(1),
  // Секрет вебхука бота (POST /subscriptions): 5–256 символов [A-Za-z0-9_-]. Пусто — вебхук выключен.
  MAX_WEBHOOK_SECRET: z.preprocess(emptyAsUndefined, z.string().regex(/^[A-Za-z0-9_-]{5,256}$/).optional()),
  // Сколько секунд после auth_date принимаем initData
  INIT_DATA_MAX_AGE_SEC: z.coerce.number().int().positive().default(86400),

  // Публичный адрес мини-приложения: отсюда берётся origin для CORS
  MINIAPP_URL: z.preprocess(emptyAsUndefined, z.url().optional()),
  // Сколько reverse-proxy стоит перед сервером (для корректного IP в лимите запросов)
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),

  // Порог совпадения для уведомления студента, %
  MATCH_NOTIFY_THRESHOLD: z.coerce.number().int().min(0).max(100).default(60),
  // Сколько новых мест в день бот присылает студенту, остальное — подборкой; 0 — без лимита (живой показ на защите)
  MATCH_DAILY_LIMIT: z.coerce.number().int().min(0).default(3),

  // GigaChat для ИИ-черновика карточки места (POST /api/internships/draft). Authorization key из Studio —
  // base64(client_id:client_secret). Пусто — черновик собирается по ключевым словам, без модели.
  // Ключ иногда копируют вместе с «Basic » из примера запроса — убираем
  GIGACHAT_AUTH_KEY: z.preprocess(
    (v) => emptyAsUndefined(typeof v === 'string' ? v.trim().replace(/^Basic\s+/i, '') : v),
    z.string().regex(/^[A-Za-z0-9+/=_-]{16,512}$/).optional(),
  ),
  GIGACHAT_SCOPE: z.preprocess(emptyAsUndefined, z.enum(['GIGACHAT_API_PERS', 'GIGACHAT_API_B2B', 'GIGACHAT_API_CORP']).default('GIGACHAT_API_PERS')),
  GIGACHAT_MODEL: z.preprocess(emptyAsUndefined, z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/).default('GigaChat-2')),
  // Сколько черновиков в час можно запросить одному пользователю: защита ключа от выжигания
  AI_DRAFT_PER_HOUR: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().default(10)),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Печатаем только имена переменных, значения могут быть секретами
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
    throw new Error(`Некорректные переменные окружения: ${names.join(', ')}`);
  }
  return parsed.data;
}
