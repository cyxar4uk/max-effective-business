// Тексты и кнопки бота «Тандем». Правила — решения Артёма от 27.09 (docs/decisions.md):
// на «вы», коротко, одна мысль, кнопка с действием; «место» вместо «стажировки».
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

/** Тип места (#22): практика, стажировка, подработка — поле internships.type. */
export type { PlaceType } from '../db/entities.js';
import type { PlaceType } from '../db/entities.js';

/** Виды уведомлений (notifications.kind) — одно место для updates.ts, notify.ts и sender.ts. */
export const KIND = {
  welcome: 'welcome',
  fallback: 'fallback',
  internshipMatch: 'internship_match',
  digest: 'digest',
  newCandidate: 'new_candidate',
  invitedStudent: 'invited_student',
  invitedEmployer: 'invited_employer',
} as const;

/** Ответы на сообщения самого пользователя (/start, текст): уходят в любое время — он только что написал боту. */
export const REPLY_KINDS: ReadonlySet<string> = new Set([KIND.welcome, KIND.fallback]);

/** Ограничения payload кнопки open_app и диплинка: до 512 символов, A–Z a–z 0–9 _ - */
export const START_PARAM = /^[\w-]{1,512}$/;

export const internshipParam = (id: number) => `internship_${id}`;

const roleButtons: AppButton[][] = [[{ text: 'Я студент', startapp: 'student' }, { text: 'Я работодатель', startapp: 'employer' }]];

export function welcomeMessage(opts: { firstName?: string | null; demo: boolean; startPayload?: string | null }): QueuedMessage {
  const lines = [
    opts.firstName ? `Здравствуйте, ${opts.firstName}! Это «Тандем».` : 'Здравствуйте! Это «Тандем».',
    'Студенту присылаем только подходящие места: практику, стажировки, подработку. Работодатель видит, кто откликнулся и насколько подходит.',
    'Кто вы?',
  ];
  if (opts.demo) lines.push('', 'Сейчас демо-режим: компании и студенты тестовые.');

  const buttons = [...roleButtons];
  // Диплинк на бота с параметром места: https://max.ru/<ник>?start=internship_<id>
  if (opts.startPayload && /^internship_\d+$/.test(opts.startPayload)) {
    buttons.unshift([{ text: 'Открыть место', startapp: opts.startPayload }]);
  }
  return { text: lines.join('\n'), buttons };
}

export function fallbackMessage(): QueuedMessage {
  return {
    text: 'Я не читаю сообщения — всё в приложении. Выберите, кто вы.',
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
  const lines = [`Новое место для вас: «${opts.title}», ${opts.company}.`];
  lines.push(opts.matchedSkills.length ? `Совпадение ${opts.score} %: ${list(opts.matchedSkills)}.` : `Совпадение ${opts.score} %.`);
  return { text: lines.join('\n'), buttons: [[{ text: 'Смотреть', startapp: internshipParam(opts.internshipId) }]] };
}

/** Студенту уже пришло столько новых мест за день: остальные — одной подборкой со ссылкой на ленту. */
export function digestMessage(): QueuedMessage {
  return {
    text: 'Сегодня для вас появились ещё подходящие места. Все они — в ленте.',
    buttons: [[{ text: 'Открыть ленту', startapp: 'student' }]],
  };
}

export function newCandidateMessage(opts: { internshipId: number; title: string; score: number }): QueuedMessage {
  return {
    text: `На «${opts.title}» откликнулся студент. Совпадение ${opts.score} %.`,
    buttons: [[{ text: 'Кандидаты', startapp: internshipParam(opts.internshipId) }]],
  };
}

/**
 * Что делать студенту после приглашения. ЧЕРНОВИК: сверить с центром карьеры.
 * Практика — по приказу Минобрнауки России и Минпросвещения России № 885/390 и положению о практике вуза.
 */
export const NEXT_STEPS: Record<'practice' | 'job', string[]> = {
  practice: [
    'Свяжитесь с работодателем в течение двух дней.',
    'Возьмите в вузе направление на практику.',
    'Оформите договор о практической подготовке — по приказу № 885/390 и положению о практике вашего вуза.',
    'Согласуйте с работодателем индивидуальное задание.',
    'В конце практики попросите отзыв о вашей работе.',
  ],
  job: [
    'Свяжитесь с работодателем в течение двух дней.',
    'Договоритесь о задачах, графике и оплате.',
    'Уточните, как вас оформят и какие документы взять.',
  ],
};

export const nextStepsFor = (type?: PlaceType | null) => (type === 'practice' ? NEXT_STEPS.practice : NEXT_STEPS.job);

export function studentInvitedMessage(opts: {
  internshipId: number;
  title: string;
  company: string;
  contactName: string | null;
  phone: string | null;
  type?: PlaceType | null;
}): QueuedMessage {
  const contact = [opts.contactName, opts.phone].filter(Boolean).join(', ') || 'работодатель свяжется с вами сам';
  const lines = [
    `Вас приглашают: «${opts.title}», ${opts.company}.`,
    `Контакт: ${contact}.`,
    '',
    'Что дальше:',
    ...nextStepsFor(opts.type).map((s, i) => `${i + 1}. ${s}`),
  ];
  return { text: lines.join('\n'), buttons: [[{ text: 'Открыть место', startapp: internshipParam(opts.internshipId) }]] };
}

export function employerInvitedMessage(opts: {
  internshipId: number;
  title: string;
  studentName: string;
  phone: string | null;
  score: number;
}): QueuedMessage {
  const lines = [
    `Вы пригласили студента на «${opts.title}».`,
    `${opts.studentName}${opts.phone ? `, ${opts.phone}` : ''}. Совпадение ${opts.score} %.`,
  ];
  if (!opts.phone) lines.push('Телефона нет — напишите студенту в MAX.');
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
