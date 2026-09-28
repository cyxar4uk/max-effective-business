// Импорт из «Работа России» на настоящем PostgreSQL (запуск — как у сквозного теста, TEST_DATABASE_URL).
// API подменён: сеть не нужна. Работает в собственной схеме trudvsem_import_test.
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataSource } from '../src/db/dataSource.js';
import { importTrudvsem } from '../src/import/index.js';
import type { TrudvsemVacancy } from '../src/import/trudvsem.js';

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = 'trudvsem_import_test';

const vacancy = (id: string): TrudvsemVacancy => ({
  id,
  'job-name': `Бухгалтер-стажер ${id}`,
  company: { name: 'ООО «Пример»' },
  region: { region_code: '7700000000000' },
  addresses: { address: [{ location: 'г Москва, ул. Тверская, д. 1' }] },
  schedule: 'Полный рабочий день',
  duty: 'Первичная документация, 1С: Бухгалтерия.',
  vac_url: `https://trudvsem.ru/vacancy/card/1/${id}`,
  requirement: { experience: 0 },
});

// Подменённый API: на любой регион и запрос отдаёт текущий список; down — не отвечает; failOne — не отвечает Татарстан
let current: TrudvsemVacancy[] = [];
let mode: 'up' | 'down' | 'failOne' = 'up';
const fakeFetch = (async (u: string) => {
  if (mode === 'down' || (mode === 'failOne' && u.includes('1600000000000'))) throw new Error('timeout');
  return new Response(JSON.stringify({ meta: { total: current.length }, results: { vacancies: current.map((vacancy) => ({ vacancy })) } }));
}) as unknown as typeof fetch;

describe.skipIf(!url)('импорт из «Работа России» на PostgreSQL', () => {
  let ds: DataSource;
  const statuses = async () =>
    Object.fromEntries(
      ((await ds.query(`SELECT source_id, status FROM internships WHERE source = 'trudvsem' ORDER BY source_id`)) as { source_id: string; status: string }[]).map(
        (r) => [r.source_id, r.status],
      ),
    );
  const run = (snapshot: TrudvsemVacancy[] = []) => importTrudvsem(ds, { fetch: fakeFetch, snapshot });

  beforeAll(async () => {
    const admin = createDataSource(url!);
    await admin.initialize();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`);
    await admin.destroy();
    const u = new URL(url!);
    u.searchParams.set('options', `-c search_path=${SCHEMA}`);
    ds = createDataSource(u.toString());
    await ds.initialize();
    await ds.runMigrations();
  });

  afterAll(async () => {
    await ds?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await ds?.destroy();
  });

  it('API молчит, база пуста — заполняем из снимка', async () => {
    mode = 'down';
    expect(await run([vacancy('s1'), vacancy('a')])).toMatchObject({ from: 'snapshot', imported: 2 });
    expect(await statuses()).toEqual({ a: 'open', s1: 'open' });
  });

  it('полный живой ответ — обновляет, добавляет, закрывает пропавшие', async () => {
    mode = 'up';
    current = [vacancy('a'), vacancy('b'), vacancy('c')];
    expect(await run()).toMatchObject({ from: 'api', imported: 3, closed: 1 });
    expect(await statuses()).toEqual({ a: 'open', b: 'open', c: 'open', s1: 'closed' });
    // повторный импорт — без дублей
    await run();
    const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM internships WHERE source = 'trudvsem'`);
    expect(n).toBe(4);
  });

  it('закрыто живым импортом → API упал → снимок не открывает закрытое', async () => {
    current = [vacancy('a'), vacancy('b')];
    await run();
    expect((await statuses()).c).toBe('closed');
    mode = 'down';
    expect(await run([vacancy('a'), vacancy('b'), vacancy('c'), vacancy('s1')])).toMatchObject({ from: 'none', imported: 0 });
    expect(await statuses()).toEqual({ a: 'open', b: 'open', c: 'closed', s1: 'closed' });
  });

  it('часть запросов не ответила — ничего не закрываем', async () => {
    mode = 'failOne';
    current = [vacancy('a')];
    expect(await run()).toMatchObject({ from: 'api', closed: 0 });
    expect((await statuses()).b).toBe('open');
  });
});
