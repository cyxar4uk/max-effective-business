import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, type Repos } from '../app.js';
import { loadConfig } from '../config.js';
import { EventBus } from '../events.js';

const log = pino({ level: 'silent' });
const repos = { ping: async () => undefined } as unknown as Repos;
const base = { NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', MAX_BOT_TOKEN: 't' };

function app(onBotUpdate: (u: unknown) => void | Promise<void>, secret = 'hook_secret-1') {
  const config = loadConfig({ ...base, ...(secret ? { MAX_WEBHOOK_SECRET: secret } : {}) });
  return createApp({ config, log, repos, events: new EventBus(log), onBotUpdate });
}

describe('POST /bot/webhook', () => {
  it('передаёт обновление боту при верном секрете', async () => {
    const got: unknown[] = [];
    const res = await request(app((u) => void got.push(u)))
      .post('/bot/webhook')
      .set('X-Max-Bot-Api-Secret', 'hook_secret-1')
      .send({ update_type: 'bot_started', user: { user_id: 1 } });
    expect(res.status).toBe(200);
    expect(got).toEqual([{ update_type: 'bot_started', user: { user_id: 1 } }]);
  });

  it('401 без секрета или с чужим', async () => {
    const got: unknown[] = [];
    const a = app((u) => void got.push(u));
    expect((await request(a).post('/bot/webhook').send({})).status).toBe(401);
    expect((await request(a).post('/bot/webhook').set('X-Max-Bot-Api-Secret', 'wrong').send({})).status).toBe(401);
    expect(got).toEqual([]);
  });

  it('500 при ошибке обработчика — MAX повторит доставку', async () => {
    const a = app(async () => {
      throw new Error('db down');
    });
    expect((await request(a).post('/bot/webhook').set('X-Max-Bot-Api-Secret', 'hook_secret-1').send({})).status).toBe(500);
  });

  it('без секрета в конфиге вебхук выключен', async () => {
    expect((await request(app(() => undefined, '')).post('/bot/webhook').send({})).status).toBe(404);
  });

  it('секрет проверяется по правилам MAX', () => {
    expect(() => loadConfig({ ...base, MAX_WEBHOOK_SECRET: 'a b' })).toThrow('MAX_WEBHOOK_SECRET');
    expect(loadConfig({ ...base, MAX_WEBHOOK_SECRET: '' }).MAX_WEBHOOK_SECRET).toBeUndefined();
  });
});
