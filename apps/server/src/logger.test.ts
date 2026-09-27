import { Writable } from 'node:stream';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, type Repos } from './app.js';
import { buildInitData } from './auth/initData.js';
import { loadConfig } from './config.js';
import { EventBus } from './events.js';
import { createLogger } from './logger.js';

// Так выглядит QueryFailedError из TypeORM: SQL, параметры и detail драйвера лежат прямо в ошибке
function queryFailedError() {
  const err = new Error('duplicate key value violates unique constraint "users_max_user_id_key"') as Error & Record<string, unknown>;
  err.name = 'QueryFailedError';
  err.query = 'UPDATE users SET phone = $1 WHERE id = $2';
  err.parameters = ['+79161234567', 5];
  err.detail = 'Key (max_user_id)=(123456) already exists.';
  err.driverError = { detail: 'Key (max_user_id)=(123456) already exists.', parameters: ['+79161234567'] };
  err.code = '23505';
  return err;
}

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
  return { lines, log: createLogger('info', stream) };
}

describe('логи без персональных данных', () => {
  it('ошибка БД логируется без SQL, параметров и detail', () => {
    const { lines, log } = capture();
    log.error({ err: queryFailedError() }, 'Ошибка');
    const out = lines.join('');
    expect(out).not.toContain('79161234567');
    expect(out).not.toContain('123456');
    expect(out).toContain('users_max_user_id_key');
    expect(out).toContain('23505');
  });

  it('то же для ошибки, дошедшей до обработчика API', async () => {
    const { lines, log } = capture();
    const repos = {
      users: {
        upsertFromMax: async () => {
          throw queryFailedError();
        },
      },
    } as unknown as Repos;
    const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://x', MAX_BOT_TOKEN: 't' });
    const app = createApp({ config, log, repos, events: new EventBus(log) });
    const initData = buildInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: '{"id":1}' }, 't');
    const res = await request(app).get('/api/me').set('X-Max-Init-Data', initData);
    expect(res.status).toBe(500);
    const out = lines.join('');
    expect(out).toContain('QueryFailedError');
    expect(out).not.toContain('79161234567');
    expect(out).not.toContain('123456');
  });
});
