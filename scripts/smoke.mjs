// Smoke-проверка поднятого стека: живость, отказ без подписи, вход с подписью MAX.
//   node --env-file=.env scripts/smoke.mjs                # локально: токен и SERVER_PORT из .env (Node.js 20.6+)
//   node scripts/smoke.mjs http://localhost:3000          # CI, токен — из MAX_BOT_TOKEN
//   node scripts/smoke.mjs https://<домен> --no-auth      # прод: без создания тестового пользователя
// Без зависимостей.
import { createHmac } from 'node:crypto';

const url = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const base = (url ?? `http://localhost:${process.env.SERVER_PORT || 3000}`).replace(/\/$/, '');
const withAuth = !process.argv.includes('--no-auth');
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}: ${err.message}`);
  }
}

async function call(path, init) {
  const res = await fetch(base + path, { ...init, signal: AbortSignal.timeout(10_000) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

// Та же подпись, что делает MAX (docs/05_max_platform.md)
function signedInitData(token, userId) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId, first_name: 'Smoke' }) };
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString().replace(/\+/g, '%20');
}

await check('GET /api/health → 200, БД доступна', async () => {
  const r = await call('/api/health');
  expect(r.status === 200 && r.body?.db === 'ok', `статус ${r.status}, ответ ${JSON.stringify(r.body)}`);
});

await check('GET /api/me без подписи → 401 в едином формате', async () => {
  const r = await call('/api/me');
  expect(r.status === 401 && r.body?.error?.code === 'UNAUTHORIZED', `статус ${r.status}`);
});

if (withAuth) {
  const token = process.env.MAX_BOT_TOKEN;
  await check('GET /api/me с подписью MAX → 200', async () => {
    expect(token, 'нет MAX_BOT_TOKEN');
    const r = await call('/api/me', { headers: { 'X-Max-Init-Data': signedInitData(token, 999_000_001) } });
    expect(r.status === 200 && r.body?.firstName === 'Smoke', `статус ${r.status}, ответ ${JSON.stringify(r.body)}`);
  });
  await check('GET /api/skills с подписью → 200', async () => {
    const r = await call('/api/skills', { headers: { 'X-Max-Init-Data': signedInitData(token, 999_000_001) } });
    expect(r.status === 200 && Array.isArray(r.body?.groups), `статус ${r.status}`);
  });
}

if (failed) {
  console.log(`\n${failed} проверок не прошло`);
  process.exit(1);
}
console.log('\nВсё в порядке');
