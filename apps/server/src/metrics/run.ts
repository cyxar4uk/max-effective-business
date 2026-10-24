// Метрики пилота: npm run metrics (из сборки, в том числе в контейнере) или npm run metrics:dev (разработка).
//   npm run metrics -- --from 2026-10-01 --to 2026-12-31
// Нужна только DATABASE_URL. Печатает агрегаты без персональных данных.
// MATCH_NOTIFY_THRESHOLD — порог «подходящего» отклика (как у бота); METRICS_EXCLUDE_MAX_IDS — max_user_id команды и
// проверяющих через запятую: их места, отклики и анкеты не считаются.
import pg from 'pg';
import { collectPilotMetrics, formatPilotMetrics, MATCH_OK, parseExcludeIds, parsePeriod } from './pilot.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Нет DATABASE_URL');
  process.exit(1);
}

const period = parsePeriod(process.argv.slice(2));
const threshold = Number(process.env.MATCH_NOTIFY_THRESHOLD ?? MATCH_OK) || MATCH_OK;
const excludeMaxIds = parseExcludeIds(process.env.METRICS_EXCLUDE_MAX_IDS);
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const metrics = await collectPilotMetrics({ query: async (sql, params) => (await client.query(sql, params)).rows }, period, {
    threshold,
    excludeMaxIds,
  });
  console.log(formatPilotMetrics(metrics, period, { threshold }));
  if (excludeMaxIds.length) console.log(`\nИсключены аккаунты команды и проверок: ${excludeMaxIds.length}`);
} finally {
  await client.end();
}
