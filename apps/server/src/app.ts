import cors from 'cors';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { errorBody, errorHandler, notFoundHandler } from './api/errors.js';
import type { DomainDeps } from './api/context.js';
import { internshipsRouter } from './api/internships.js';
import { profilesRouter } from './api/profiles.js';
import { apiRouter } from './api/routes.js';
import { webhookRouter, type UpdateHandler } from './api/webhook.js';
import { requireMaxUser } from './auth/middleware.js';
import type { Config } from './config.js';
import type { User } from './db/entities.js';
import type { UsersRepo } from './db/users.js';
import type { EventBus } from './events.js';
import { safeErr } from './logger.js';

// Всё, что API нужно от хранилища. Реализация — db/repos.ts, в тестах — заглушки.
export interface Repos {
  users: UsersRepo;
  savePhone(userId: number, phone: string): Promise<User>;
  roles(userId: number): Promise<{ student: boolean; employer: boolean }>;
  skillGroups(): Promise<{ name: string; skills: { code: string; name: string }[] }[]>;
  ping(): Promise<void>;
}

export interface AppDeps {
  config: Config;
  log: Logger;
  repos: Repos;
  events: EventBus;
  // Маршруты профилей и стажировок работают поверх БД; в тестах без БД их нет
  domain?: Omit<DomainDeps, 'events'>;
  // Обработчик обновлений MAX Bot API от модуля bot; без него вебхук не подключается
  onBotUpdate?: UpdateHandler;
}

export function createApp({ config, log, repos, events, domain, onBotUpdate }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger: log,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      // Без заголовков и тел: в них initData и персональные данные
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        err: safeErr,
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      // В разработке разрешаем любой origin, в проде — только домен мини-приложения
      origin: config.MINIAPP_URL ? new URL(config.MINIAPP_URL).origin : config.NODE_ENV !== 'production',
      allowedHeaders: ['Content-Type', 'X-Max-Init-Data'],
      methods: ['GET', 'POST', 'PUT', 'PATCH'],
      maxAge: 600,
    }),
  );
  // Лимит запросов — до разбора тела, чтобы учитывались и запросы, которые ломаются на разборе. Health не считаем.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: config.RATE_LIMIT_PER_MIN,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => req.path === '/health',
      handler: (_req, res) => {
        res.status(429).json(errorBody('RATE_LIMITED', 'Слишком много запросов, подождите минуту'));
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  // Живость: если БД не ответила за 2 секунды — 503, а не зависший запрос
  app.get('/api/health', async (_req, res) => {
    try {
      await Promise.race([
        repos.ping(),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), 2000).unref()),
      ]);
      res.json({ status: 'ok', db: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'unavailable' });
    }
  });

  if (config.MAX_WEBHOOK_SECRET && onBotUpdate) {
    app.use(webhookRouter({ secret: config.MAX_WEBHOOK_SECRET, onUpdate: onBotUpdate }));
  }

  app.use(
    '/api',
    requireMaxUser({ botToken: config.MAX_BOT_TOKEN, maxAgeSec: config.INIT_DATA_MAX_AGE_SEC, users: repos.users }),
    apiRouter(repos, config),
    ...(domain ? [profilesRouter({ ...domain, events }), internshipsRouter({ ...domain, events, feedMinScore: config.FEED_MIN_SCORE })] : []),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
