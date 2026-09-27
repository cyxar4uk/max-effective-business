import { pino } from 'pino';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, type Repos } from './app.js';
import { CONSENT_VERSION } from './api/routes.js';
import { buildInitData } from './auth/initData.js';
import { loadConfig } from './config.js';
import type { User } from './db/entities.js';
import { EventBus } from './events.js';

const TOKEN = 'test-bot-token';
const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', MAX_BOT_TOKEN: TOKEN, RATE_LIMIT_PER_MIN: '5' });
const log = pino({ level: 'silent' });

function initData(userId = 42) {
  return buildInitData(
    { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId, first_name: 'Анна' }) },
    TOKEN,
  );
}

// Хранилище в памяти вместо PostgreSQL
function fakeRepos(opts: { dbDown?: boolean } = {}): Repos {
  const users = new Map<number, User>();
  return {
    users: {
      async upsertFromMax(u) {
        const existing = users.get(u.id);
        const user = Object.assign(existing ?? ({ id: users.size + 1, phone: null, consentAt: null, consentVersion: null } as unknown as User), {
          maxUserId: u.id,
          firstName: u.first_name ?? null,
          lastName: u.last_name ?? null,
        });
        users.set(u.id, user);
        return user;
      },
      async saveConsent(userId, version) {
        const user = [...users.values()].find((u) => u.id === userId)!;
        return Object.assign(user, { consentAt: new Date('2026-09-27T10:00:00Z'), consentVersion: version });
      },
    },
    async savePhone(userId, phone) {
      const user = [...users.values()].find((u) => u.id === userId)!;
      return Object.assign(user, { phone });
    },
    roles: async () => ({ student: false, employer: false }),
    skillGroups: async () => [{ name: 'Аналитика', skills: [{ code: 'excel', name: 'Excel' }] }],
    ping: async () => {
      if (opts.dbDown) throw new Error('down');
    },
  };
}

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp({ config, log, repos: fakeRepos(), events: new EventBus(log) });
});

describe('GET /api/health', () => {
  it('отвечает без авторизации', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('503, если БД недоступна', async () => {
    const down = createApp({ config, log, repos: fakeRepos({ dbDown: true }), events: new EventBus(log) });
    expect((await request(down).get('/api/health')).status).toBe(503);
  });
});

describe('авторизация по initData', () => {
  it('401 без заголовка', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('401 с испорченной подписью', async () => {
    const res = await request(app).get('/api/me').set('X-Max-Init-Data', initData().replace(/hash=[0-9a-f]{4}/, 'hash=0000'));
    expect(res.status).toBe(401);
  });

  it('пускает с корректной подписью и создаёт пользователя', async () => {
    const res = await request(app).get('/api/me').set('X-Max-Init-Data', initData());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ firstName: 'Анна', hasPhone: false, consent: null, roles: { student: false, employer: false } });
  });
});

describe('POST /api/me/consent', () => {
  it('сохраняет согласие с датой и версией', async () => {
    const res = await request(app).post('/api/me/consent').set('X-Max-Init-Data', initData()).send({ version: CONSENT_VERSION });
    expect(res.status).toBe(200);
    expect(res.body.consent).toEqual({ at: '2026-09-27T10:00:00.000Z', version: CONSENT_VERSION });
  });

  it('400 с ошибкой по полю при неверной версии', async () => {
    const res = await request(app).post('/api/me/consent').set('X-Max-Init-Data', initData()).send({ version: 'old' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', fields: { version: expect.any(String) } });
  });

  it('400 на некорректный JSON', async () => {
    const res = await request(app)
      .post('/api/me/consent')
      .set('X-Max-Init-Data', initData())
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('прочее', () => {
  it('GET /api/skills отдаёт справочник по группам', async () => {
    const res = await request(app).get('/api/skills').set('X-Max-Init-Data', initData());
    expect(res.body.groups[0].skills[0]).toEqual({ code: 'excel', name: 'Excel' });
  });

  it('404 в едином формате', async () => {
    const res = await request(app).get('/api/nope').set('X-Max-Init-Data', initData());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('429 при превышении лимита запросов', async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await request(app).get('/api/me').set('X-Max-Init-Data', initData())).status;
    expect(last).toBe(429);
  });
});
