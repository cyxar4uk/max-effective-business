// Метрики пилота: npm run metrics (из сборки, в том числе в контейнере) или npm run metrics:dev (разработка).
//   npm run metrics -- --from 2026-10-01 --to 2026-12-31
// Нужна только DATABASE_URL. Печатает агрегаты без персональных данных.
import pg from 'pg';
import { collectPilotMetrics, formatPilotMetrics, parsePeriod } from './pilot.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Нет DATABASE_URL');
  process.exit(1);
}

const period = parsePeriod(process.argv.slice(2));
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const metrics = await collectPilotMetrics({ query: async (sql, params) => (await client.query(sql, params)).rows }, period);
  console.log(formatPilotMetrics(metrics, period));
} finally {
  await client.end();
}
