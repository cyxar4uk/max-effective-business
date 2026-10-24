// Модуль бота (Тимур): обработчик вебхука MAX Bot API, уведомления по внутренним событиям, очередь отправки.
// Бот ничего не знает про HTTP API: получает события с id и читает данные через botData.
import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import type { Config } from '../config.js';
import { createBotData } from '../db/botData.js';
import { createUsersRepo } from '../db/users.js';
import type { EventBus } from '../events.js';
import { createMaxApi, type MaxApi } from './maxApi.js';
import { onDemoResponses, onInterestCreated, onInterestInvited, onInternshipCreated, serial, type NotifyDeps } from './notify.js';
import { createSender } from './sender.js';
import { createUpdateHandler } from './updates.js';

export interface BotDeps {
  events: EventBus;
  ds: DataSource;
  config: Pick<Config, 'MAX_BOT_TOKEN' | 'MATCH_NOTIFY_THRESHOLD' | 'MATCH_DAILY_LIMIT' | 'QUIET_HOURS' | 'SEED_DEMO'>;
  log: Logger;
  api?: MaxApi;
}

export function registerBot({ events, ds, config, log, api = createMaxApi({ token: config.MAX_BOT_TOKEN }) }: BotDeps) {
  const data = createBotData(ds);
  const users = createUsersRepo(ds);

  // Ник бота нужен для кнопок open_app (поле web_app). Берём из GET /me один раз; при ошибке спросим снова.
  let username: Promise<string> | null = null;
  const botUsername = () => {
    username ??= api.getMe().then(
      (me) => {
        if (!me.username) throw new Error('У бота нет публичного ника (GET /me)');
        return me.username;
      },
      (err: unknown) => {
        username = null;
        throw err;
      },
    );
    return username;
  };

  const notify: NotifyDeps = {
    data,
    threshold: config.MATCH_NOTIFY_THRESHOLD,
    dailyLimit: config.MATCH_DAILY_LIMIT,
    async skillNames() {
      const rows: { code: string; name: string }[] = await ds.query('SELECT code, name FROM skills');
      return new Map(rows.map((r) => [r.code, r.name]));
    },
    countInDispatchDay: (userId, kind) => data.countInDispatchDay(userId, kind),
  };

  const logQueued = (event: string) => (queued: number) => {
    if (queued) log.info({ event, queued }, 'Уведомления поставлены в очередь');
  };
  // Новые места обрабатываем строго по одному: иначе несколько мест, опубликованных одновременно,
  // прочитают один и тот же счётчик и проскочат мимо лимита «3 в день»
  const oneAtATime = serial();
  events.on('internship.created', (e) => oneAtATime(() => onInternshipCreated(notify, e)).then(logQueued('internship.created')));
  events.on('interest.created', (e) => onInterestCreated(notify, e).then(logQueued('interest.created')));
  events.on('interest.invited', (e) => onInterestInvited(notify, e).then(logQueued('interest.invited')));
  events.on('demo.responses', (e) => onDemoResponses(notify, e).then(logQueued('demo.responses')));

  const sender = createSender({ data, api, botUsername, log, quietHours: config.QUIET_HOURS });
  const loop = sender.start();
  log.info({ quietHours: config.QUIET_HOURS ? `${config.QUIET_HOURS.from}-${config.QUIET_HOURS.to}` : 'off' }, 'Тихие часы бота по Москве');

  return {
    onUpdate: createUpdateHandler({ upsertUser: (u) => users.upsertFromMax(u), enqueue: (n) => data.enqueue(n), demo: config.SEED_DEMO }),
    stop: () => loop.stop(),
  };
}
