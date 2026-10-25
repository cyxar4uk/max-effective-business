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

// Вуз не из шаблонов — примерная форма приказа 885/390
const model: DocData = { ...data, vuz: vuzFor('Казанский федеральный университет') };

describe('договор о практической подготовке', () => {
  it('преамбула согласована по падежам: должность и ФИО из формы — в скобках после «в лице представителя»', async () => {
    const text = await docText(await buildDoc('contract', model));
    expect(text).toContain('в лице уполномоченного лица вуза, действующего на основании');
    expect(text).toContain('в лице представителя (генеральный директор Сафина Анна Сергеевна), действующего на основании Устава');
    expect(text).not.toMatch(/в лице (уполномоченное|генеральный)/);
    // В подписях — именительный
    expect(text).toContain('уполномоченное лицо вуза');
  });

  it('у вуза не из шаблонов — форма 885/390: «Организация» и два приложения', async () => {
    const text = await docText(await buildDoc('contract', model));
    expect(text).toContain('именуемое в дальнейшем «Организация»');
    expect(text).toContain('Приложение № 2');
    expect(text).not.toContain('Президентская академия');
  });
});

describe('формы РАНХиГС (Положение о практической подготовке, приказ от 28.04.2025 № 02-734)', () => {
  it('договор — по приложению № 1 положения', async () => {
    const text = await docText(await buildDoc('contract', data));
    expect(text).toContain('заключаемый между федеральным государственным бюджетным образовательным учреждением');
    expect(text).toContain('и профильной организацией — Общество с ограниченной ответственностью «Чайная лавка»');
    expect(text).toContain('именуемое в дальнейшем «Президентская академия», в лице уполномоченного лица Президентской академии');
    expect(text).toContain('в лице представителя (генеральный директор Сафина Анна Сергеевна), действующего на основании Устава');
    expect(text).toContain('в 3-дневный срок сообщить об этом Президентской академии');
    expect(text).toContain('не позднее чем за 15 (пятнадцать) рабочих дней до начала практики');
    expect(text).toContain('является безвозмездным');
    expect(text).toContain('№ 152-ФЗ');
    expect(text).toContain('ИНН 7729050901, КПП 772901001, ОГРН 1027739610018');
    // Одно приложение: ФИО студента, сроки и помещение — в нём
    expect(text).not.toContain('Приложение № 2');
    expect(text).toContain('Айдар Галиев');
    expect(text).toContain('с 09.11.2026 по 18.12.2026');
    expect(text).not.toMatch(/«Организация»|в лице (уполномоченное|генеральный)/);
  });

  it('индивидуальное задание и отзыв — по приложениям № 4 и № 5', async () => {
    const task = await docText(await buildDoc('task', data));
    expect(task).toContain('Индивидуальное задание');
    expect(task).toContain('обучающегося 3 курса');
    expect(task).toContain('Планируемые результаты');
    expect(task).toContain('УТВЕРЖДАЮ');
    expect(task).toContain('СОГЛАСОВАНО');
    expect(task).toContain('Задание принято к исполнению');

    const review = await docText(await buildDoc('review', data));
    expect(review).toContain('Отзыв о работе обучающегося в период прохождения практики');
    expect(review).toContain('может (не может) быть допущен к защите отчёта по практике');
    expect(review).toContain('в профильной организации — Общество с ограниченной ответственностью «Чайная лавка»');
    expect(review).toContain('руководитель отдела продаж ________ / Петров Илья Андреевич /');
  });

  it('письмо о согласии в положении РАНХиГС не предусмотрено — общее', async () => {
    const letter = await docText(await buildDoc('consent_letter', data));
    expect(letter).toContain('Письмо о согласии принять обучающегося на практику');
  });
});
