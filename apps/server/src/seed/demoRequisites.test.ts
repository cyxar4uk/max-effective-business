// Тестовые реквизиты демо-компаний для документов практики (F-16, #144).
import { describe, expect, it } from 'vitest';
import { DEMO_EMPLOYERS, DEMO_INTERNSHIPS } from './demo/data.js';

describe('демо-реквизиты для документов практики (#144)', () => {
  it('у каждой демо-компании заполнены все поля, обязательные для договора и письма', () => {
    for (const e of DEMO_EMPLOYERS) {
      for (const [field, value] of Object.entries(e.requisites)) {
        expect(value.trim().length, `${e.key}.${field}`).toBeGreaterThan(0);
        expect(value.length, `${e.key}.${field}`).toBeLessThanOrEqual(300);
      }
    }
  });

  it('ИНН — 10 цифр, ОГРН — 13, оба с кодом региона 00: с настоящей компанией не совпадут; не повторяются', () => {
    for (const e of DEMO_EMPLOYERS) {
      expect(e.requisites.inn, e.key).toMatch(/^00\d{8}$/);
      // ОГРН: признак, две цифры года, две цифры региона — регион 00
      expect(e.requisites.ogrn, e.key).toMatch(/^1\d{2}00\d{8}$/);
    }
    expect(new Set(DEMO_EMPLOYERS.map((e) => e.requisites.inn)).size).toBe(DEMO_EMPLOYERS.length);
    expect(new Set(DEMO_EMPLOYERS.map((e) => e.requisites.ogrn)).size).toBe(DEMO_EMPLOYERS.length);
  });

  it('в документе видно, что реквизиты тестовые; почта — на зарезервированном домене', () => {
    for (const e of DEMO_EMPLOYERS) {
      expect(e.requisites.legalName, e.key).toContain('тестовые реквизиты');
      expect(e.requisites.legalAddress, e.key).toContain('тестовый адрес');
      expect(e.requisites.legalAddress, e.key).toContain(e.city);
      expect(e.requisites.responsibleEmail, e.key).toMatch(/@example\.com$/);
    }
  });

  it('для показа на финале есть демо-место с типом «практика» в Казани', () => {
    const kazanPractice = DEMO_INTERNSHIPS.filter((i) => i.type === 'practice' && i.city === 'Казань');
    expect(kazanPractice.length).toBeGreaterThan(0);
  });
});
