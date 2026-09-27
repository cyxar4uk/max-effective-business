// Модуль бота (Тимур): обработчик вебхука MAX Bot API, уведомления по внутренним событиям, очередь отправки.
// Бот ничего не знает про HTTP API: получает события с id и читает данные через botData.
import type { Logger } from 'pino';
import type { DataSource } from 'typeorm';
import type { Config } from '../config.js';
import { createBotData } from '../db/botData.js';
import { createUsersRepo } from '../db/users.js';
import type { EventBus } from '../events.js';
import { createMaxApi, type MaxApi } from './maxApi.js';
import { onInterestCreated, onInterestInvited, onInternshipCreated, type NotifyDeps } from './notify.js';
import { createSender } from './sender.js';
import { createUpdateHandler } from './updates.js';

export interface BotDeps {
  events: EventBus;
  ds: DataSource;
  config: Pick<Config, 'MAX_BOT_TOKEN' | 'MATCH_NOTIFY_THRESHOLD' | 'SEED_DEMO'>;
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
    async skillNames() {
      const rows: { code: string; name: string }[] = await ds.query('SELECT code, name FROM skills');
      return new Map(rows.map((r) => [r.code, r.name]));
    },
    // Уведомления за текущие московские сутки — для лимита «не больше 3 новых мест в день»
    async countToday(userId, kind) {
      const [row]: { n: number }[] = await ds.query(
        `SELECT count(*)::int AS n FROM notifications
         WHERE user_id = $1 AND kind = $2
           AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow')`,
        [userId, kind],
      );
      return row?.n ?? 0;
    },
  };

  const logQueued = (event: string) => (queued: number) => {
    if (queued) log.info({ event, queued }, 'Уведомления поставлены в очередь');
  };
  events.on('internship.created', (e) => onInternshipCreated(notify, e).then(logQueued('internship.created')));
  events.on('interest.created', (e) => onInterestCreated(notify, e).then(logQueued('interest.created')));
  events.on('interest.invited', (e) => onInterestInvited(notify, e).then(logQueued('interest.invited')));

  const sender = createSender({ data, api, botUsername, log });
  const loop = sender.start();

  return {
    onUpdate: createUpdateHandler({ upsertUser: (u) => users.upsertFromMax(u), enqueue: (n) => data.enqueue(n), demo: config.SEED_DEMO }),
    stop: () => loop.stop(),
  };
}
