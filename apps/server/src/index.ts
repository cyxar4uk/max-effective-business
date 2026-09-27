import { temporaryMatcher } from './api/matcher.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDataSource } from './db/dataSource.js';
import { createRepos } from './db/repos.js';
import { EventBus } from './events.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);

const ds = createDataSource(config.DATABASE_URL);
await ds.initialize();
if (config.RUN_MIGRATIONS) {
  const applied = await ds.runMigrations();
  if (applied.length) log.info({ migrations: applied.map((m) => m.name) }, 'Миграции применены');
}

const events = new EventBus(log);
// Сюда подключаются модули Тимура: registerBot({ events, ds, config, log }), сид при SEED_DEMO=true

// temporaryMatcher — до модуля matching Тимура, см. src/api/matcher.ts
const app = createApp({ config, log, repos: createRepos(ds), events, domain: { ds, matcher: temporaryMatcher } });
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
