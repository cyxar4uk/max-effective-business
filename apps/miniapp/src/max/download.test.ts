import { describe, expect, it } from 'vitest';
import { downloadVia } from './download';

describe('скачивание документа в MAX', () => {
  it('телефон и компьютер с downloadFile — качает клиент MAX', () => {
    expect(downloadVia('android', true)).toBe('native');
    expect(downloadVia('ios', true)).toBe('native');
    expect(downloadVia('desktop', true)).toBe('native');
  });

  it('веб-версия MAX — ссылка в браузере, даже если метод есть', () => {
    expect(downloadVia('web', true)).toBe('link');
    expect(downloadVia('web', false)).toBe('link');
  });

  it('старый клиент без downloadFile — ссылка, а не ошибка', () => {
    expect(downloadVia('android', false)).toBe('link');
    expect(downloadVia(undefined, false)).toBe('link');
  });
});
