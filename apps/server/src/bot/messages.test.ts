import { describe, expect, it } from 'vitest';
import {
  digestMessage,
  employerInvitedMessage,
  fallbackMessage,
  internshipMatchMessage,
  placeTerms,
  NEXT_STEPS,
  nextStepsFor,
  START_PARAM,
  studentInvitedMessage,
  toMessageBody,
  welcomeMessage,
} from './messages.js';

const params = (m: { buttons: { startapp: string }[][] }) => m.buttons.flat().map((b) => b.startapp);

describe('тексты бота', () => {
  it('приветствие: две роли, пометка демо только в демо-режиме', () => {
    const demo = welcomeMessage({ firstName: 'Анна', demo: true });
    expect(demo.text).toContain('Здравствуйте, Анна! Это «Тандем».');
    expect(demo.text).toContain('демо-режим');
    expect(params(demo)).toEqual(['student', 'employer']);
    expect(welcomeMessage({ demo: false }).text).not.toContain('демо');
  });

  it('приветствие по диплинку стажировки добавляет кнопку этой стажировки', () => {
    expect(params(welcomeMessage({ demo: false, startPayload: 'internship_12' }))).toEqual(['internship_12', 'student', 'employer']);
    expect(params(welcomeMessage({ demo: false, startPayload: 'что-то<script>' }))).toEqual(['student', 'employer']);
  });

  it('на прочие сообщения — подсказка и те же кнопки, без тупика', () => {
    expect(params(fallbackMessage())).toEqual(['student', 'employer']);
  });

  it('новая стажировка: процент, не больше трёх навыков, кнопка на карточку', () => {
    const m = internshipMatchMessage({ internshipId: 5, title: 'Аналитик', company: 'Луч', score: 85, matchedSkills: ['Excel', 'SQL', 'Python', 'Git'] });
    expect(m.text).toContain('Совпадение 85 %');
    expect(m.text).toContain('Excel, SQL, Python.');
    expect(m.text).not.toContain('Git');
    expect(params(m)).toEqual(['internship_5']);
  });

  it('близкие навыки — отдельной строкой «наполовину засчитано» (#71); без них строки нет', () => {
    const m = internshipMatchMessage({
      internshipId: 5, title: 'Аналитик', company: 'Луч', score: 85, matchedSkills: ['SQL'], closeSkills: ['Excel (есть Google Таблицы)'],
    });
    expect(m.text.split('\n').slice(-2)).toEqual(['Совпадение 85 %: SQL.', 'Наполовину засчитано: Excel (есть Google Таблицы).']);
    const plain = internshipMatchMessage({ internshipId: 5, title: 'Аналитик', company: 'Луч', score: 85, matchedSkills: ['SQL'], closeSkills: [] });
    expect(plain.text).not.toContain('Наполовину');
  });

  it('приглашение студенту: контакт и пронумерованный чек-лист', () => {
    const m = studentInvitedMessage({ internshipId: 3, title: 'Юрист', company: 'Бюро', contactName: 'Павел Родионов', phone: '+70000001004' });
    expect(m.text).toContain('Контакт: Павел Родионов, +70000001004.');
    NEXT_STEPS.job.forEach((s, i) => expect(m.text).toContain(`${i + 1}. ${s}`));
  });

  it('приглашение работодателю без телефона студента: ждать связи, а без номеров у обоих — добавить свой', () => {
    const m = employerInvitedMessage({ internshipId: 3, title: 'Юрист', studentName: 'Мария Иванова', phone: null, score: 70, employerHasPhone: true });
    expect(m.text).toContain('Мария Иванова. Совпадение 70 %.');
    expect(m.text).toContain('Бот отправил ему ваш контакт');
    expect(m.text).not.toContain('напишите студенту');

    const none = employerInvitedMessage({ internshipId: 3, title: 'Юрист', studentName: 'Мария Иванова', phone: null, score: 70 });
    expect(none.text).toContain('Добавьте свой номер');
  });

  it('приглашение работодателю с телефоном студента — без подсказок про номер', () => {
    const m = employerInvitedMessage({ internshipId: 3, title: 'Юрист', studentName: 'Мария Иванова', phone: '+79990000000', score: 70 });
    expect(m.text).toContain('Мария Иванова, +79990000000. Совпадение 70 %.');
    expect(m.text).not.toContain('Бот отправил');
    expect(m.text).not.toContain('Добавьте свой номер');
  });

  it('все параметры кнопок укладываются в ограничения payload MAX', () => {
    const all = [welcomeMessage({ demo: true, startPayload: 'internship_1' }), fallbackMessage(), internshipMatchMessage({ internshipId: 999999, title: 't', company: 'c', score: 1, matchedSkills: [] })];
    for (const p of all.flatMap(params)) expect(p).toMatch(START_PARAM);
  });
});

describe('toMessageBody', () => {
  it('open_app с ником бота в web_app и параметром в payload; простой текст без разметки', () => {
    const body = toMessageBody({ text: 'Привет', buttons: [[{ text: 'Я студент', startapp: 'student' }]] }, 'career_bot');
    expect(body).toEqual({
      text: 'Привет',
      attachments: [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'open_app', text: 'Я студент', web_app: 'career_bot', payload: 'student' }]] } }],
    });
    expect(body.format).toBeUndefined();
  });

  it('недопустимый параметр отбрасывается, пустые ряды убираются, текст режется до 4000', () => {
    const body = toMessageBody({ text: 'x'.repeat(5000), buttons: [[{ text: 'Плохая', startapp: 'a b' }]] }, 'bot');
    expect(body.text).toHaveLength(4000);
    expect(body.attachments).toBeUndefined();
  });
});

describe('решения Артёма от 27.09', () => {
  it('«Тандем», «место» вместо «стажировки», на «вы»', () => {
    const texts = [
      welcomeMessage({ firstName: 'Анна', demo: true }).text,
      fallbackMessage().text,
      internshipMatchMessage({ internshipId: 1, title: 'Аналитик', company: 'Луч', score: 80, matchedSkills: ['Excel'] }).text,
      digestMessage().text,
      studentInvitedMessage({ internshipId: 1, title: 'Аналитик', company: 'Луч', contactName: null, phone: null }).text,
    ].join('\n');
    expect(texts).toContain('Тандем');
    // «место» вместо «стажировки» в уведомлениях; в приветствии «стажировки» — это перечисление типов мест
    const notifications = texts
      .split('\n')
      .filter((l) => !l.includes('практику, стажировки и подработку'))
      .join('\n');
    expect(notifications).not.toMatch(/стажировк[ауие]/i);
    expect(texts).not.toMatch(/(^|[^а-яё])(ты|тебя|тебе|твой|твоя)([^а-яё]|$)/i);
  });

  it('практика — чек-лист с направлением, договором по приказу № 885/390, заданием и отзывом', () => {
    const m = studentInvitedMessage({ internshipId: 1, title: 'Помощник юриста', company: 'Бюро', contactName: 'Павел', phone: null, type: 'practice' });
    for (const s of NEXT_STEPS.practice) expect(m.text).toContain(s);
    expect(m.text).toContain('885/390');
    expect(m.text).toMatch(/направление/);
    expect(m.text).toMatch(/задание/);
    expect(m.text).toMatch(/отзыв/);
  });

  it('стажировка, подработка и тип не указан — чек-лист без документов практики', () => {
    expect(nextStepsFor('internship')).toEqual(NEXT_STEPS.job);
    expect(nextStepsFor('part_time')).toEqual(NEXT_STEPS.job);
    expect(nextStepsFor(undefined)).toEqual(NEXT_STEPS.job);
    expect(NEXT_STEPS.job.join(' ')).not.toContain('885/390');
  });

  it('подборка ведёт в ленту студента', () => {
    expect(digestMessage().buttons.flat().map((b) => b.startapp)).toEqual(['student']);
  });
});

describe('тип и оплата в сообщении о новом месте (#74)', () => {
  it('сумма, без оплаты, оплачивается без суммы, не указана', () => {
    expect(placeTerms('internship', true, 30000)).toMatch(/^Стажировка · 30\s000 ₽ в месяц$/);
    expect(placeTerms('practice', false, null)).toBe('Практика · без оплаты');
    expect(placeTerms('part_time', true, null)).toBe('Подработка · оплачивается');
    expect(placeTerms('internship', null, null)).toBe('Стажировка · оплата не указана');
  });

  it('строка идёт второй, после названия и компании', () => {
    const m = internshipMatchMessage({ internshipId: 5, title: 'Аналитик', company: 'Луч', score: 85, matchedSkills: ['Excel'], terms: { type: 'practice', paid: false, salary: null } });
    expect(m.text.split('\n')[1]).toBe('Практика · без оплаты.');
  });
});
