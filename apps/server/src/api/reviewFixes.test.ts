// Исправления по ревью сервера (#102), которые проверяются без БД.
import { describe, expect, it } from 'vitest';
import { digestMessage, welcomeMessage } from '../bot/messages.js';
import { importTrudvsem } from '../import/index.js';
import { phoneBody } from './schemas.js';

const signed = { authDate: '1790000000', hash: 'a'.repeat(64) };

describe('номер телефона (#102)', () => {
  it('пробелы, скобки и дефисы допустимы, номер не переписывается до проверки подписи', () => {
    for (const phone of ['+7 999 000-00-00', '+7 (999) 000-00-00', '8 999 000 00 00', '+79990000000']) {
      const r = phoneBody.safeParse({ phone, ...signed });
      expect(r.success, phone).toBe(true);
      // Подпись MAX считается от номера как он пришёл — схема его не меняет
      expect(r.data?.phone).toBe(phone);
    }
  });

  it('не номер — по-прежнему ошибка', () => {
    for (const phone of ['+7 999', 'телефон', '+7 999 000 00 00 00 00 00 00']) {
      expect(phoneBody.safeParse({ phone, ...signed }).success, phone).toBe(false);
    }
  });
});

describe('тексты бота (#102)', () => {
  it('«практику, стажировки и подработку»', () => {
    expect(welcomeMessage({ demo: false }).text).toContain('практику, стажировки и подработку.');
  });

  it('подборка без «сегодня»: после 22:00 она уходит утром', () => {
    expect(digestMessage().text).not.toMatch(/сегодня/i);
  });
});

describe('импорт «Работа России»: одна битая вакансия (#102)', () => {
  it('ошибка записи одной вакансии не роняет импорт: остальные записаны, сбой посчитан', async () => {
    let inserts = 0;
    let written = 0;
    const db = {
      query: async (text: string) => {
        if (text.includes('INSERT INTO internships')) {
          inserts++;
          // Вторая вакансия «битая»: база её не принимает
          if (inserts === 2) throw new Error('invalid byte sequence for encoding "UTF8": 0x00');
          written++;
        }
        if (text.includes('count(*)')) return [{ n: 0 }];
        return text.includes('RETURNING id') ? [[], 0] : [];
      },
    };
    // API не ответил — база пуста, поэтому берётся сохранённый снимок
    const r = await importTrudvsem(db, { fetch: async () => { throw new Error('offline'); } });
    expect(r.from).toBe('snapshot');
    expect(inserts).toBeGreaterThan(2);
    expect(r.failed).toBe(1);
    expect(r.imported).toBe(written);
    expect(written).toBe(inserts - 1);
  });
});
