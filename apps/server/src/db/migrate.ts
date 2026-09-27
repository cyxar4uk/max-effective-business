import { loadConfig } from '../config.js';
import { createDataSource } from './dataSource.js';

// Ручной запуск миграций: npm run migrate (в контейнере) или npm run migrate:dev
const config = loadConfig();
const ds = createDataSource(config.DATABASE_URL);
await ds.initialize();
const applied = await ds.runMigrations();
console.log(applied.length ? `Применены миграции: ${applied.map((m) => m.name).join(', ')}` : 'Новых миграций нет');
await ds.destroy();
