import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDoc, vuzFor, type DocData } from './templates.js';

/** Текст document.xml из .docx без разметки. */
async function docText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml.replace(/<[^>]+>/g, '');
}

const data: DocData = {
  company: {
    legalName: 'Общество с ограниченной ответственностью «Чайная лавка»',
    inn: '1655123456',
    ogrn: '1021602843470',
    legalAddress: '420111, г. Казань, ул. Баумана, д. 1',
    // Как в форме: именительный падеж, основание — в родительном
    signerName: 'Сафина Анна Сергеевна',
    signerPosition: 'генеральный директор',
    signerBasis: 'Устава',
    responsibleName: 'Петров Илья Андреевич',
    responsiblePosition: 'руководитель отдела продаж',
    responsiblePhone: null,
    responsibleEmail: null,
  },
  companyName: 'Чайная лавка',
  vuz: vuzFor('РАНХиГС'),
  student: { fullName: 'Айдар Галиев', program: 'Маркетинг', course: 3 },
  place: { title: 'Карточки товаров на Wildberries', city: 'Казань', start: '2026-11-09', end: '2026-12-18', address: 'г. Казань' },
  date: '26.10.2026',
};

describe('договор о практической подготовке', () => {
  it('преамбула согласована по падежам: должность и ФИО из формы — в скобках после «в лице представителя»', async () => {
    const text = await docText(await buildDoc('contract', data));
    expect(text).toContain('в лице уполномоченного лица вуза, действующего на основании');
    expect(text).toContain('в лице представителя (генеральный директор Сафина Анна Сергеевна), действующего на основании Устава');
    expect(text).not.toMatch(/в лице (уполномоченное|генеральный)/);
    // В подписях — именительный
    expect(text).toContain('уполномоченное лицо вуза');
  });
});
