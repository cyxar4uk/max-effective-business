import { describe, expect, it } from 'vitest';
import {
  employerInvitedMessage,
  fallbackMessage,
  internshipMatchMessage,
  NEXT_STEPS,
  START_PARAM,
  studentInvitedMessage,
  toMessageBody,
  welcomeMessage,
} from './messages.js';

const params = (m: { buttons: { startapp: string }[][] }) => m.buttons.flat().map((b) => b.startapp);

describe('тексты бота', () => {
  it('приветствие: две роли, пометка демо только в демо-режиме', () => {
    const demo = welcomeMessage({ firstName: 'Анна', demo: true });
    expect(demo.text).toContain('Здравствуйте, Анна!');
    expect(demo.text).toContain('демо-режиме');
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

  it('приглашение студенту: контакт и пронумерованный чек-лист', () => {
    const m = studentInvitedMessage({ internshipId: 3, title: 'Юрист', company: 'Бюро', contactName: 'Павел Родионов', phone: '+70000001004' });
    expect(m.text).toContain('Контакт: Павел Родионов, +70000001004.');
    NEXT_STEPS.forEach((s, i) => expect(m.text).toContain(`${i + 1}. ${s}`));
  });

  it('приглашение работодателю без телефона студента — подсказка написать в MAX', () => {
    const m = employerInvitedMessage({ internshipId: 3, title: 'Юрист', studentName: 'Мария Иванова', phone: null, score: 70 });
    expect(m.text).toContain('Мария Иванова. Совпадение 70 %.');
    expect(m.text).toContain('напишите ему в MAX');
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
