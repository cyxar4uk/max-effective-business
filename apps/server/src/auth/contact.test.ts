import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { contactCheckString, signContact, verifyContact } from './contact.js';
import { signDataCheckString } from './initData.js';

const TOKEN = 'test-bot-token';
const base = { phone: '+79990000000', authDate: '1790500000' };

describe('verifyContact', () => {
  it('строка для подписи: ключи по алфавиту, телефон без +', () => {
    expect(contactCheckString(base, 42)).toBe('authDate=1790500000\nphone=79990000000\nuserId=42');
  });

  it('принимает все три прочтения формулы из документации', () => {
    const data = contactCheckString(base, 42);
    expect(verifyContact({ ...base, hash: signContact(base, 42, TOKEN) }, 42, TOKEN)).toBe('key=token');
    expect(verifyContact({ ...base, hash: createHmac('sha256', data).update(TOKEN).digest('hex') }, 42, TOKEN)).toBe('key=data');
    expect(verifyContact({ ...base, hash: signDataCheckString(data, TOKEN) }, 42, TOKEN)).toBe('webappdata');
  });

  it('отклоняет чужой userId, другой номер и другой токен', () => {
    const hash = signContact(base, 42, TOKEN);
    expect(verifyContact({ ...base, hash }, 43, TOKEN)).toBeNull();
    expect(verifyContact({ ...base, phone: '+79990000001', hash }, 42, TOKEN)).toBeNull();
    expect(verifyContact({ ...base, hash }, 42, 'other')).toBeNull();
    expect(verifyContact({ ...base, hash: 'zz' }, 42, TOKEN)).toBeNull();
  });
});
