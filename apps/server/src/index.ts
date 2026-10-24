import { createDrafterFromConfig } from './ai/index.js';
import { requireEmployer } from './api/context.js';
import { createApp } from './app.js';
import { registerBot } from './bot/index.js';
import { loadConfig } from './config.js';
import { createDataSource } from './db/dataSource.js';
import { createRepos } from './db/repos.js';
import { loadTaskTags } from './db/taskTags.js';
import { EventBus } from './events.js';
import { registerTrudvsemImport } from './import/index.js';
import { createLogger } from './logger.js';
import { matcher } from './matching/index.js';
import { registerDemoResponder, seedDemo, seedSkills, TASK_TAGS } from './seed/index.js';
import { trustRussianRootCa } from './tls/russianRootCa.js';

const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);
// MAX Bot API — на сертификате Минцифры: без этого корня бот не достучится до MAX (см. src/tls/russianRootCa.ts)
if (!trustRussianRootCa()) log.warn('Node.js старше 24.5: корень Минцифры не добавлен, запросы к MAX Bot API будут падать на TLS');

const ds = createDataSource(config.DATABASE_URL);
await ds.initialize();
if (config.RUN_MIGRATIONS) {
  const applied = await ds.runMigrations();
  if (applied.length) log.info({ migrations: applied.map((m) => m.name) }, 'Миграции применены');
}
// Справочник навыков нужен и в проде: без него не сохранить анкету и стажировку. Загрузка идемпотентна.
log.info({ skills: await seedSkills(ds) }, 'Справочник навыков загружен');
log.info({ tags: await loadTaskTags(ds, TASK_TAGS) }, 'Справочник тегов задач загружен');
if (config.SEED_DEMO) log.info(await seedDemo(ds), 'Демо-данные загружены');

const events = new EventBus(log);
// Демо-режим: на стажировку проверяющего сразу откликаются подходящие демо-студенты (см. src/seed/demo/responder.ts)
if (config.SEED_DEMO) registerDemoResponder({ events, ds, log, threshold: config.MATCH_NOTIFY_THRESHOLD });
const bot = registerBot({ events, ds, config, log });
// Места из «Работа России»: фоном при старте и раз в 6 часов; при недоступном API — сохранённый снимок
const trudvsem = registerTrudvsemImport({ ds, log });

// ИИ-черновик карточки места: GigaChat, а без ключа — по ключевым словам (src/ai/)
const draft = {
  drafter: createDrafterFromConfig(config, log),
  assertEmployer: async (userId: number) => void (await requireEmployer(ds, userId)),
};
const app = createApp({ config, log, repos: createRepos(ds), events, domain: { ds, matcher }, onBotUpdate: bot.onUpdate, draft });
const server = app.listen(config.PORT, () => log.info({ port: config.PORT }, 'Сервер запущен'));
server.requestTimeout = 15_000;

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'Остановка');
  const force = setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    trudvsem.stop();
    await bot.stop().catch(() => undefined);
    await ds.destroy().catch(() => undefined);
    clearTimeout(force);
    process.exit(0);
  });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
