// Кнопка «Документы для практики» в приглашении (F-16, #144).
import { describe, expect, it } from 'vitest';
import { docsParam, employerInvitedMessage, START_PARAM, studentInvitedMessage, toMessageBody } from './messages.js';

const student = (type: 'practice' | 'internship' | 'part_time', interestId?: number) =>
  studentInvitedMessage({ internshipId: 7, title: 'Помощник бухгалтера', company: 'Баланс', contactName: 'Лилия', phone: '+70000001015', type, interestId });
const employer = (type: 'practice' | 'internship' | 'part_time', interestId?: number) =>
  employerInvitedMessage({ internshipId: 7, title: 'Помощник бухгалтера', studentName: 'Мария Иванова', phone: '+70000002001', score: 85, type, interestId });
const params = (m: { buttons: { startapp: string }[][] }) => m.buttons.flat().map((b) => b.startapp);

describe('документы для практики в приглашении (#144)', () => {
  it('практика: обеим сторонам — строка «Документы для практики готовы» и кнопка docs_<id отклика> первой', () => {
    for (const m of [student('practice', 42), employer('practice', 42)]) {
      expect(m.text).toContain('Документы для практики готовы');
      expect(m.buttons[0]).toEqual([{ text: 'Документы для практики', startapp: 'docs_42' }]);
      // Прежняя кнопка на месте
      expect(params(m)).toContain('internship_7');
    }
  });

  it('стажировка и подработка — ни строки, ни кнопки', () => {
    for (const type of ['internship', 'part_time'] as const) {
      for (const m of [student(type, 42), employer(type, 42)]) {
        expect(m.text, type).not.toContain('Документы для практики');
        expect(params(m), type).toEqual(['internship_7']);
      }
    }
  });

  it('отклик неизвестен — кнопки нет, сообщение как раньше', () => {
    expect(params(student('practice'))).toEqual(['internship_7']);
    expect(student('practice').text).not.toContain('Документы для практики');
  });

  it('параметр укладывается в ограничения payload MAX и доходит до кнопки open_app', () => {
    expect(docsParam(2_147_483_647)).toMatch(START_PARAM);
    const body = toMessageBody(student('practice', 42), 't373_hakaton_max_bot');
    const payloads = body.attachments?.[0]?.payload.buttons.flat().map((b) => ('payload' in b ? b.payload : null));
    expect(payloads).toEqual(['docs_42', 'internship_7']);
  });
});
