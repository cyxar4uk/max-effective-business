import { Writable } from 'node:stream';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, type Repos } from '../app.js';
import { loadConfig } from '../config.js';
import { EventBus } from '../events.js';
import { createLogger } from '../logger.js';
import { buildInitData } from './initData.js';

// Диагностика для проверки на живом MAX: в логе причина отказа и вариант кодирования, но не сами данные запуска

function setup() {
  const lines: string[] = [];
  const log = createLogger('info', new Writable({ write: (c, _e, cb) => (lines.push(String(c)), cb()) }));
  const repos = {
    users: { upsertFromMax: async (u: { id: number }) => ({ id: 1, maxUserId: u.id, firstName: null, lastName: null, phone: null, consentAt: null, consentVersion: null }) },
    roles: async () => ({ student: false, employer: false }),
    ping: async () => undefined,
  } as unknown as Repos;
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://x', MAX_BOT_TOKEN: 't', INIT_DATA_MAX_AGE_SEC: '60' });
  const app = createApp({ config, log, repos, events: new EventBus(log) });
  const entries = () => lines.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { app, entries, raw: () => lines.join('') };
}

const now = () => String(Math.floor(Date.now() / 1000));

describe('диагностика initData в логе', () => {
  it('причина отказа — кодом, без самих данных', async () => {
    const { app, entries, raw } = setup();
    const forged = buildInitData({ auth_date: now(), user: '{"id":5,"first_name":"Секретное Имя"}' }, 'чужой-токен');
    await request(app).get('/api/me').set('X-Max-Init-Data', forged).expect(401);
    await request(app).get('/api/me').expect(401);
    const old = buildInitData({ auth_date: String(Math.floor(Date.now() / 1000) - 3600), user: '{"id":5}' }, 't');
    await request(app).get('/api/me').set('X-Max-Init-Data', old).expect(401);

    const rejected = entries().filter((e) => e.msg === 'initData отклонён');
    expect(rejected.map((e) => [e.level, e.initDataError])).toEqual([
      [40, 'BAD_SIGNATURE'],
      [30, 'MISSING'],
      [40, 'EXPIRED'],
    ]);
    expect(rejected[2]!.initDataAgeSec).toBeGreaterThanOrEqual(3600);
    expect(raw()).not.toContain('Секретное');
    expect(raw()).not.toContain('hash=');
  });

  it('пробелы как «+» отмечаются в логе', async () => {
    const { app, entries } = setup();
    const strict = buildInitData({ auth_date: now(), user: '{"id":6,"first_name":"Анна Мария"}' }, 't');
    await request(app).get('/api/me').set('X-Max-Init-Data', strict).expect(200);
    expect(entries().some((e) => e.initDataEncoding === 'plus')).toBe(false);
    await request(app).get('/api/me').set('X-Max-Init-Data', strict.replace(/%20/g, '+')).expect(200);
    expect(entries().filter((e) => e.initDataEncoding === 'plus')).toHaveLength(1);
  });
});
