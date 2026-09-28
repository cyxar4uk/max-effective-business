import { describe, expect, it } from 'vitest';
import { buildInitData, validateInitData } from './initData.js';

const TOKEN = 'test-bot-token';
const now = new Date('2026-09-27T12:00:00Z');
const authDate = String(Math.floor(now.getTime() / 1000) - 60);
const user = JSON.stringify({ id: 42, first_name: 'Анна', username: 'anna' });

const opts = { maxAgeSec: 3600, now };

describe('validateInitData', () => {
  it('принимает корректно подписанные данные', () => {
    const raw = buildInitData({ auth_date: authDate, query_id: 'q1', user, start_param: 'internship_7' }, TOKEN);
    const result = validateInitData(raw, TOKEN, opts);
    expect(result).toMatchObject({ ok: true, data: { user: { id: 42, first_name: 'Анна' }, startParam: 'internship_7' } });
  });

  it('проверяет подпись независимо от порядка параметров', () => {
    const raw = buildInitData({ user, auth_date: authDate }, TOKEN).split('&').reverse().join('&');
    expect(validateInitData(raw, TOKEN, opts).ok).toBe(true);
  });

  it('совпадает с эталонной подписью по алгоритму из документации MAX', () => {
    // Посчитано независимо (Python hmac): secret = HMAC(key="WebAppData", msg=token),
    // hash = HMAC(key=secret, msg='auth_date=1790500000\nuser={"id":1}')
    const hash = '629d4c9fd061a8dbf4a2370188189b585718e839b56e0a4c5da8b6761b51c928';
    const raw = `auth_date=1790500000&user=${encodeURIComponent('{"id":1}')}&hash=${hash}`;
    expect(validateInitData(raw, TOKEN, { maxAgeSec: 1e9, now })).toMatchObject({ ok: true, data: { user: { id: 1 } } });
  });

  it('принимает пробелы, закодированные как «+»', () => {
    const withSpace = JSON.stringify({ id: 7, first_name: 'Анна Мария' });
    const strict = buildInitData({ auth_date: authDate, user: withSpace }, TOKEN);
    expect(validateInitData(strict, TOKEN, opts).ok).toBe(true);
    const formEncoded = strict.replace(/%20/g, '+');
    expect(formEncoded).toContain('+');
    expect(validateInitData(formEncoded, TOKEN, opts)).toMatchObject({ ok: true, data: { user: { first_name: 'Анна Мария' }, spacesAsPlus: true } });
    expect(validateInitData(strict, TOKEN, opts)).toMatchObject({ ok: true, data: { spacesAsPlus: false } });
    // «+» как настоящий символ по-прежнему работает
    const plus = buildInitData({ auth_date: authDate, user: JSON.stringify({ id: 8, first_name: 'A+B' }) }, TOKEN);
    expect(validateInitData(plus, TOKEN, opts)).toMatchObject({ ok: true, data: { user: { first_name: 'A+B' } } });
  });

  it('отклоняет пустой заголовок', () => {
    expect(validateInitData(undefined, TOKEN, opts)).toEqual({ ok: false, error: 'MISSING' });
    expect(validateInitData('', TOKEN, opts)).toEqual({ ok: false, error: 'MISSING' });
  });

  it('отклоняет данные без hash или с мусором', () => {
    expect(validateInitData('auth_date=1&user=%7B%7D', TOKEN, opts)).toEqual({ ok: false, error: 'MALFORMED' });
    expect(validateInitData('hash=zz', TOKEN, opts)).toEqual({ ok: false, error: 'MALFORMED' });
    expect(validateInitData('%%%', TOKEN, opts)).toEqual({ ok: false, error: 'MALFORMED' });
  });

  it('отклоняет испорченную подпись', () => {
    const raw = buildInitData({ auth_date: authDate, user }, TOKEN);
    const tampered = raw.replace(/hash=(.)/, (_m, c: string) => `hash=${c === 'a' ? 'b' : 'a'}`);
    expect(validateInitData(tampered, TOKEN, opts)).toEqual({ ok: false, error: 'BAD_SIGNATURE' });
  });

  it('отклоняет подменённые данные при исходной подписи', () => {
    const raw = buildInitData({ auth_date: authDate, user }, TOKEN);
    const forged = raw.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
    expect(validateInitData(forged, TOKEN, opts)).toEqual({ ok: false, error: 'BAD_SIGNATURE' });
  });

  it('отклоняет подпись другим токеном', () => {
    const raw = buildInitData({ auth_date: authDate, user }, 'other-token');
    expect(validateInitData(raw, TOKEN, opts)).toEqual({ ok: false, error: 'BAD_SIGNATURE' });
  });

  it('отклоняет просроченные данные', () => {
    const old = String(Math.floor(now.getTime() / 1000) - 7200);
    const raw = buildInitData({ auth_date: old, user }, TOKEN);
    expect(validateInitData(raw, TOKEN, opts)).toEqual({ ok: false, error: 'EXPIRED', ageSec: 7200 });
  });

  it('отклоняет auth_date из будущего', () => {
    const future = String(Math.floor(now.getTime() / 1000) + 3600);
    const raw = buildInitData({ auth_date: future, user }, TOKEN);
    expect(validateInitData(raw, TOKEN, opts)).toEqual({ ok: false, error: 'EXPIRED', ageSec: -3600 });
  });

  it('понимает auth_date в миллисекундах', () => {
    const raw = buildInitData({ auth_date: String(now.getTime() - 60_000), user }, TOKEN);
    expect(validateInitData(raw, TOKEN, opts).ok).toBe(true);
  });

  it('отклоняет данные без пользователя', () => {
    const raw = buildInitData({ auth_date: authDate }, TOKEN);
    expect(validateInitData(raw, TOKEN, opts)).toEqual({ ok: false, error: 'NO_USER' });
  });
});
