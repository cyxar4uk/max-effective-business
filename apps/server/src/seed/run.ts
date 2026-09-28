// Ручная загрузка справочника и демо-данных: npm run seed:demo (разработка) или npm run seed (из сборки).
import { loadConfig } from '../config.js';
import { createDataSource } from '../db/dataSource.js';
import { loadTaskTags } from '../db/taskTags.js';
import { createLogger } from '../logger.js';
import { seedDemo, seedSkills, TASK_TAGS } from './index.js';

const config = loadConfig();
const log = createLogger(config.LOG_LEVEL);
const ds = createDataSource(config.DATABASE_URL);
await ds.initialize();
try {
  if (config.RUN_MIGRATIONS) await ds.runMigrations();
  log.info({ skills: await seedSkills(ds) }, 'Справочник навыков загружен');
  log.info({ tags: await loadTaskTags(ds, TASK_TAGS) }, 'Справочник тегов задач загружен');
  log.info(await seedDemo(ds), 'Демо-данные загружены');
} finally {
  await ds.destroy();
}
