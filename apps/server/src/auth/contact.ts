import { createHmac, timingSafeEqual } from 'node:crypto';
import { signDataCheckString } from './initData.js';

// Проверка номера из WebApp.requestContact() — https://dev.max.ru/docs/webapps/bridge (сверено 27.09.2026).
// Клиент получает { phone, authDate, hash }. Документация: hash = HMAC_SHA256(authDate + phone + userId, botToken),
// где параметры — строки "key=value" в алфавитном порядке через \n, phone без "+".
// Какой аргумент ключ, из текста однозначно не следует, поэтому принимаем три варианта. Каждый требует токена
// бота, так что подделать номер без токена нельзя. Какой сработал — пишем в лог, после проверки в MAX оставим один.

export interface ContactPayload {
  phone: string;
  authDate: string;
  hash: string;
}

export type ContactScheme = 'key=token' | 'key=data' | 'webappdata';

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export function contactCheckString(c: { phone: string; authDate: string }, maxUserId: number): string {
  return [`authDate=${c.authDate}`, `phone=${normalizePhone(c.phone)}`, `userId=${maxUserId}`].join('\n');
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b.toLowerCase(), 'hex');
  return x.length === 32 && x.length === y.length && timingSafeEqual(x, y);
}

export function verifyContact(c: ContactPayload, maxUserId: number, botToken: string): ContactScheme | null {
  if (!/^[0-9a-f]{64}$/i.test(c.hash)) return null;
  const data = contactCheckString(c, maxUserId);
  const candidates: [ContactScheme, string][] = [
    ['key=token', createHmac('sha256', botToken).update(data).digest('hex')],
    ['key=data', createHmac('sha256', data).update(botToken).digest('hex')],
    ['webappdata', signDataCheckString(data, botToken)],
  ];
  for (const [scheme, expected] of candidates) if (sameHex(expected, c.hash)) return scheme;
  return null;
}

// Для тестов и режима разработки
export function signContact(c: { phone: string; authDate: string }, maxUserId: number, botToken: string): string {
  return createHmac('sha256', botToken).update(contactCheckString(c, maxUserId)).digest('hex');
}
