// «Это тандем!»: тексты следующих шагов, телефон и отметка «приглашение уже показали».
import type { Interest, InternshipType } from '../../api/types';

/**
 * Следующие шаги после приглашения — те же, что бот присылает в чат:
 * apps/server/src/bot/messages.ts, NEXT_STEPS. Меняются только вместе.
 */
const NEXT_STEPS: Record<'practice' | 'job', string[]> = {
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

export const nextStepsFor = (type: InternshipType) => (type === 'practice' ? NEXT_STEPS.practice : NEXT_STEPS.job);

/** «на практику» / «на стажировку» / «на подработку». */
export const INVITE_TO: Record<InternshipType, string> = {
  practice: 'практику',
  internship: 'стажировку',
  part_time: 'подработку',
};

/** +79990001234 → +7 999 000-12-34; другое — как есть. */
export function formatPhone(phone: string): string {
  const m = /^\+?7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone.replace(/[\s()-]/g, ''));
  return m ? `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : phone;
}

/** Какие приглашения студент уже видел (id мест): экран «Это тандем!» показываем сам один раз. */
const SEEN_KEY = 'tandem.seenInvites';
const seen = new Set<number>();

function load(): void {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    if (Array.isArray(list)) for (const id of list) if (typeof id === 'number') seen.add(id);
  } catch {
    // Хранилище недоступно — помним до конца сеанса
  }
}

export function inviteSeen(id: number): boolean {
  load();
  return seen.has(id);
}

const seenListeners = new Set<() => void>();

/** Подписка на «приглашение просмотрели» — для бейджа на «Откликах» (inviteWatch.ts). */
export function onInviteSeen(listener: () => void): void {
  seenListeners.add(listener);
}

export function markInviteSeen(id: number): void {
  seen.add(id);
  for (const l of seenListeners) l();
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
  } catch {
    // см. load()
  }
}

/** Адрес экрана и состояние перехода: отклик уже загружен списком, from — откуда пришли (для «Все отклики»). */
export const tandemPath = (id: number) => `/student/tandem/${id}`;
export interface TandemState {
  interest?: Interest;
  from?: 'interests';
}

/** Приглашения, которые в этом сеансе уже открывали сами: после «Все отклики» следующее не выскакивает следом. */
const offered = new Set<number>();

/**
 * Непросмотренное приглашение, которое «Отклики» открывают сами: самое свежее из новых.
 * Остальные новые остаются с акцентом в списке и празднуются по нажатию; при следующем запуске — снова по одному.
 */
export function takeFreshInvite(items: Interest[]): Interest | null {
  const fresh = items.filter((i) => i.status === 'invited' && !inviteSeen(i.internship.id) && !offered.has(i.internship.id));
  if (fresh.length === 0) return null;
  for (const i of fresh) offered.add(i.internship.id);
  return fresh.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
}
