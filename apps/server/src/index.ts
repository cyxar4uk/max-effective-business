import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDataSource } from './db/dataSource.js';
import { createRepos } from './db/repos.js';
import { EventBus } from './events.js';
import { createLogger } from './logger.js';
import { matcher } from './matching/index.js';
import { seedDemo, seedSkills } from './seed/index.js';

const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);

const ds = createDataSource(config.DATABASE_URL);
await ds.initialize();
if (config.RUN_MIGRATIONS) {
  const applied = await ds.runMigrations();
  if (applied.length) log.info({ migrations: applied.map((m) => m.name) }, 'Миграции применены');
}
// Справочник навыков нужен и в проде: без него не сохранить анкету и стажировку. Загрузка идемпотентна.
log.info({ skills: await seedSkills(ds) }, 'Справочник навыков загружен');
if (config.SEED_DEMO) log.info(await seedDemo(ds), 'Демо-данные загружены');

const events = new EventBus(log);
// Сюда подключается модуль бота Тимура: registerBot({ events, ds, config, log })

const app = createApp({ config, log, repos: createRepos(ds), events, domain: { ds, matcher } });
const server = app.listen(config.PORT, () => log.info({ port: config.PORT }, 'Сервер запущен'));
server.requestTimeout = 15_000;

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'Остановка');
  const force = setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await ds.destroy().catch(() => undefined);
    clearTimeout(force);
    process.exit(0);
  });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
