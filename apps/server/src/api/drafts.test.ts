import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { GIGACHAT_API_BASE, GIGACHAT_OAUTH_URL, createGigaChat } from '../ai/gigachat.js';
import { createPlaceDrafter, type PlaceDrafter } from '../ai/placeDraft.js';
import { createApp, type Repos } from '../app.js';
import { buildInitData } from '../auth/initData.js';
import { loadConfig } from '../config.js';
import type { User } from '../db/entities.js';
import { EventBus } from '../events.js';
import { ApiError } from './errors.js';

const TOKEN = 'test-bot-token';
const log = pino({ level: 'silent' });
const EMPLOYER = 42;
const STUDENT = 7;

const config = (perHour = '10') =>
  loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', MAX_BOT_TOKEN: TOKEN, RATE_LIMIT_PER_MIN: '1000', AI_DRAFT_PER_HOUR: perHour });

const initData = (maxUserId: number) =>
  buildInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: maxUserId, first_name: 'Анна' }) }, TOKEN);

function fakeRepos(): Repos {
  const users = new Map<number, User>();
  return {
    users: {
      async upsertFromMax(u) {
        // id в нашей БД совпадает с id MAX — так проще проверять «чей» запрос
        const user = users.get(u.id) ?? ({ id: u.id, maxUserId: u.id, phone: null, consentAt: new Date(), consentVersion: 'x' } as unknown as User);
        users.set(u.id, user);
        return user;
      },
      saveConsent: async () => {
        throw new Error('not used');
      },
    },
    savePhone: async () => {
      throw new Error('not used');
    },
    roles: async () => ({ student: false, employer: false }),
    skillGroups: async () => [],
    ping: async () => undefined,
  };
}

const assertEmployer = async (userId: number) => {
  if (userId !== EMPLOYER && userId !== EMPLOYER + 1) throw new ApiError('FORBIDDEN', 'Сначала заполните профиль компании');
};

function appWith(drafter: PlaceDrafter, perHour?: string) {
  return createApp({ config: config(perHour), log, repos: fakeRepos(), events: new EventBus(log), draft: { drafter, assertEmployer } });
}

const stubDrafter = (ai = true): PlaceDrafter => ({
  ai,
  draft: vi.fn(async () => ({ source: 'ai' as const, title: 'Т', tags: [], requiredSkills: ['smm'], niceSkills: [], type: null, format: null })),
});
const TEXT = 'Нужен человек вести инсту кофейни и снимать сторис';

describe('POST /api/internships/draft', () => {
  it('без данных запуска MAX — 401', async () => {
    const res = await request(appWith(stubDrafter())).post('/api/internships/draft').send({ text: TEXT });
    expect(res.status).toBe(401);
  });

  it('без профиля компании — 403, модель не вызывается', async () => {
    const drafter = stubDrafter();
    const res = await request(appWith(drafter)).post('/api/internships/draft').set('X-Max-Init-Data', initData(STUDENT)).send({ text: TEXT });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(drafter.draft).not.toHaveBeenCalled();
  });

  it('проверяет текст: пустой, слишком короткий, длиннее 1000 символов, не строка', async () => {
    const app = appWith(stubDrafter());
    for (const body of [{}, { text: '   ' }, { text: 'кофе' }, { text: 'а'.repeat(1001) }, { text: 42 }]) {
      const res = await request(app).post('/api/internships/draft').set('X-Max-Init-Data', initData(EMPLOYER)).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.fields.text).toBeTruthy();
    }
  });

  it('отдаёт черновик и передаёт текст без пробелов по краям', async () => {
    const drafter = stubDrafter();
    const res = await request(appWith(drafter)).post('/api/internships/draft').set('X-Max-Init-Data', initData(EMPLOYER)).send({ text: `  ${TEXT}  ` });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: 'ai', requiredSkills: ['smm'] });
    expect(drafter.draft).toHaveBeenCalledWith(TEXT, { signal: expect.any(AbortSignal) });
  });

  it('лимит — на пользователя в час: сверх лимита 429, другой работодатель не задет', async () => {
    const drafter = stubDrafter();
    const app = appWith(drafter, '2');
    const call = (uid: number) => request(app).post('/api/internships/draft').set('X-Max-Init-Data', initData(uid)).send({ text: TEXT });
    expect((await call(EMPLOYER)).status).toBe(200);
    expect((await call(EMPLOYER)).status).toBe(200);
    const third = await call(EMPLOYER);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
    expect((await call(EMPLOYER + 1)).status).toBe(200);
    expect(drafter.draft).toHaveBeenCalledTimes(3);
  });

  it('без модели (черновик по ключевым словам) лимит в час не действует', async () => {
    const app = appWith(stubDrafter(false), '1');
    const call = () => request(app).post('/api/internships/draft').set('X-Max-Init-Data', initData(EMPLOYER)).send({ text: TEXT });
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
  });

  it('отказы по профилю и тексту лимит не расходуют', async () => {
    const app = appWith(stubDrafter(), '1');
    await request(app).post('/api/internships/draft').set('X-Max-Init-Data', initData(EMPLOYER)).send({ text: '' });
    const ok = await request(app).post('/api/internships/draft').set('X-Max-Init-Data', initData(EMPLOYER)).send({ text: TEXT });
    expect(ok.status).toBe(200);
  });

  describe('с GigaChat (fetch подменён)', () => {
    const KEY = 'BBBBBBBBBBBBBBBBBBBBBBBB';
    function gigaFetch(chat: () => Response) {
      return vi.fn(async (url: string | URL | Request) => {
        if (String(url) === GIGACHAT_OAUTH_URL) {
          return new Response(JSON.stringify({ access_token: 'tok', expires_at: Date.now() + 30 * 60_000 }), { status: 200 });
        }
        if (String(url) === `${GIGACHAT_API_BASE}/chat/completions`) return chat();
        throw new Error('unexpected');
      });
    }
    const answer = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

    it('ответ модели фильтруется по справочнику', async () => {
      const f = gigaFetch(() =>
        answer('{"title":"Вести соцсети кофейни","tag":"social_ads","requiredSkills":["smm","rm_rf"],"niceSkills":["smm","canva"],"type":"part_time","format":"office"}'),
      );
      const drafter = createPlaceDrafter({ ai: createGigaChat({ authKey: KEY, scope: 'GIGACHAT_API_PERS', model: 'GigaChat-2', fetch: f }), log });
      const res = await request(appWith(drafter)).post('/api/internships/draft').set('X-Max-Init-Data', initData(EMPLOYER)).send({ text: TEXT });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        source: 'ai',
        title: 'Вести соцсети кофейни',
        tags: ['social_ads'],
        requiredSkills: ['smm'],
        niceSkills: ['canva'],
        // В тексте ни слова о типе и формате — догадки модели не подставляем
        type: null,
        format: null,
      });
      // Ключ — только в запросе за токеном, в ответ API он не попадает
      expect(JSON.stringify(res.body)).not.toContain(KEY);
    });

    it('GigaChat отвечает 500 — черновик по ключевым словам', async () => {
      const f = gigaFetch(() => new Response('{}', { status: 500 }));
      const drafter = createPlaceDrafter({ ai: createGigaChat({ authKey: KEY, scope: 'GIGACHAT_API_PERS', model: 'GigaChat-2', fetch: f }), log });
      const res = await request(appWith(drafter)).post('/api/internships/draft').set('X-Max-Init-Data', initData(EMPLOYER)).send({ text: TEXT });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ source: 'rules', tags: ['social_ads'], requiredSkills: ['smm', 'video_editing'] });
    });
  });
});

describe('конфиг GigaChat', () => {
  const base = { NODE_ENV: 'test', DATABASE_URL: 'postgres://unused', MAX_BOT_TOKEN: TOKEN };

  it('пустые переменные — значения по умолчанию, ключа нет', () => {
    const c = loadConfig({ ...base, GIGACHAT_AUTH_KEY: '', GIGACHAT_SCOPE: '', GIGACHAT_MODEL: '', AI_DRAFT_PER_HOUR: '' });
    expect(c).toMatchObject({ GIGACHAT_AUTH_KEY: undefined, GIGACHAT_SCOPE: 'GIGACHAT_API_PERS', GIGACHAT_MODEL: 'GigaChat-2', AI_DRAFT_PER_HOUR: 10 });
  });

  it('ключ, скопированный с «Basic », принимается без префикса', () => {
    expect(loadConfig({ ...base, GIGACHAT_AUTH_KEY: ' Basic CCCCCCCCCCCCCCCCCCCC ' }).GIGACHAT_AUTH_KEY).toBe('CCCCCCCCCCCCCCCCCCCC');
  });

  it('ошибка в переменной — имя в сообщении, значения нет', () => {
    expect(() => loadConfig({ ...base, GIGACHAT_AUTH_KEY: 'не ключ, а текст' })).toThrow(/GIGACHAT_AUTH_KEY/);
    expect(() => loadConfig({ ...base, GIGACHAT_AUTH_KEY: 'не ключ, а текст' })).not.toThrow(/не ключ/);
  });
});
