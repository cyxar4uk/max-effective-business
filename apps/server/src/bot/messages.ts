// Тексты и кнопки бота. ЧЕРНОВИК Тимура — тексты и чек-лист согласует Артём.
// Сообщения идут простым текстом, без разметки: в них попадают названия от работодателей,
// и символы разметки в названии не должны ломать сообщение.
import type { NewMessageBody } from './maxApi.js';

/** Кнопка, открывающая мини-приложение с параметром запуска (start_param). */
export interface AppButton {
  text: string;
  startapp: string;
}

/** Сообщение в очереди (notifications.payload). Ник бота подставляется при отправке. */
export interface QueuedMessage {
  text: string;
  buttons: AppButton[][];
}

/** Ограничения payload кнопки open_app и диплинка: до 512 символов, A–Z a–z 0–9 _ - */
export const START_PARAM = /^[\w-]{1,512}$/;

export const internshipParam = (id: number) => `internship_${id}`;

const roleButtons: AppButton[][] = [[{ text: 'Я студент', startapp: 'student' }, { text: 'Я работодатель', startapp: 'employer' }]];

export function welcomeMessage(opts: { firstName?: string | null; demo: boolean; startPayload?: string | null }): QueuedMessage {
  const hello = opts.firstName ? `Здравствуйте, ${opts.firstName}!` : 'Здравствуйте!';
  const lines = [
    hello,
    '',
    'Это бот центра карьеры. Студенту он присылает только те стажировки, которые подходят по навыкам. Работодатель видит заинтересованных студентов с процентом совпадения. После взаимного интереса бот присылает обоим контакты.',
    '',
    'Выберите, кто вы, — откроется приложение.',
  ];
  if (opts.demo) lines.push('', 'Сейчас сервис работает в демо-режиме: компании и студенты в нём тестовые.');

  const buttons = [...roleButtons];
  // Диплинк на бота с параметром стажировки: https://max.ru/<ник>?start=internship_<id>
  if (opts.startPayload && /^internship_\d+$/.test(opts.startPayload)) {
    buttons.unshift([{ text: 'Открыть стажировку', startapp: opts.startPayload }]);
  }
  return { text: lines.join('\n'), buttons };
}

export function fallbackMessage(): QueuedMessage {
  return {
    text: 'Я не читаю сообщения — всё происходит в приложении. Выберите, кто вы, чтобы его открыть.',
    buttons: roleButtons,
  };
}

const list = (items: string[]) => items.slice(0, 3).join(', ');

export function internshipMatchMessage(opts: {
  internshipId: number;
  title: string;
  company: string;
  score: number;
  matchedSkills: string[];
}): QueuedMessage {
  const lines = [`Новая стажировка для вас: «${opts.title}», ${opts.company}.`, `Совпадение ${opts.score} %.`];
  if (opts.matchedSkills.length) lines.push(`Совпало: ${list(opts.matchedSkills)}.`);
  return { text: lines.join('\n'), buttons: [[{ text: 'Открыть', startapp: internshipParam(opts.internshipId) }]] };
}

export function newCandidateMessage(opts: { internshipId: number; title: string; score: number }): QueuedMessage {
  return {
    text: `Новый заинтересованный студент на стажировку «${opts.title}». Совпадение ${opts.score} %.`,
    buttons: [[{ text: 'Кандидаты', startapp: internshipParam(opts.internshipId) }]],
  };
}

/** Что делать студенту после приглашения. ЧЕРНОВИК: сверить с центром карьеры (документы для стажировки и практики). */
export const NEXT_STEPS = [
  'Свяжитесь с работодателем в течение двух дней: позвоните или напишите.',
  'Подготовьте короткий рассказ о себе и учебных проектах.',
  'Спросите в центре карьеры, нужен ли договор о практике или направление от вуза.',
  'На встречу возьмите паспорт и студенческий билет.',
];

export function studentInvitedMessage(opts: {
  internshipId: number;
  title: string;
  company: string;
  contactName: string | null;
  phone: string | null;
}): QueuedMessage {
  const contact = [opts.contactName, opts.phone].filter(Boolean).join(', ') || 'работодатель свяжется с вами сам';
  const lines = [
    `Вас пригласили на стажировку «${opts.title}», ${opts.company}.`,
    `Контакт: ${contact}.`,
    '',
    'Что дальше:',
    ...NEXT_STEPS.map((s, i) => `${i + 1}. ${s}`),
  ];
  return { text: lines.join('\n'), buttons: [[{ text: 'Открыть стажировку', startapp: internshipParam(opts.internshipId) }]] };
}

export function employerInvitedMessage(opts: {
  internshipId: number;
  title: string;
  studentName: string;
  phone: string | null;
  score: number;
}): QueuedMessage {
  const lines = [
    `Вы пригласили студента на стажировку «${opts.title}».`,
    `${opts.studentName}${opts.phone ? `, ${opts.phone}` : ''}. Совпадение ${opts.score} %.`,
  ];
  if (!opts.phone) lines.push('Телефон студент не указал — напишите ему в MAX.');
  return { text: lines.join('\n'), buttons: [[{ text: 'Кандидаты', startapp: internshipParam(opts.internshipId) }]] };
}

/** Превращает сообщение из очереди в тело POST /messages. Параметры, не подходящие под ограничения MAX, отбрасываются. */
export function toMessageBody(msg: QueuedMessage, botUsername: string): NewMessageBody {
  const buttons = msg.buttons
    .map((row) =>
      row
        .filter((b) => START_PARAM.test(b.startapp))
        .map((b) => ({ type: 'open_app' as const, text: b.text, web_app: botUsername, payload: b.startapp })),
    )
    .filter((row) => row.length > 0);
  return {
    text: msg.text.slice(0, 4000),
    ...(buttons.length ? { attachments: [{ type: 'inline_keyboard' as const, payload: { buttons } }] } : {}),
  };
}
