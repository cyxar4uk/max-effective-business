// Уведомления по внутренним событиям. Здесь только решение «кому и что» и постановка в очередь;
// отправка — в sender.ts. Ключи идемпотентности не дают повтору события прислать сообщение дважды.
import type { BotData, Recipient } from '../db/botData.js';
import type { AppEvents } from '../events.js';
import { matchStudentToInternship, shouldNotify } from '../matching/index.js';
import {
  employerInvitedMessage,
  internshipMatchMessage,
  newCandidateMessage,
  studentInvitedMessage,
  type QueuedMessage,
} from './messages.js';

export interface NotifyDeps {
  data: Pick<BotData, 'internship' | 'studentsWithProfiles' | 'interestContext' | 'enqueue'>;
  /** Коды навыков → названия из справочника. */
  skillNames(): Promise<Map<string, string>>;
  threshold: number;
}

/** Демо-пользователи — не настоящие аккаунты MAX: им не пишем. */
const reachable = (r: Recipient | null | undefined): r is Recipient => !!r && !r.isDemo && r.maxUserId > 0;

async function enqueue(deps: NotifyDeps, to: Recipient, kind: string, dedupeKey: string, message: QueuedMessage): Promise<boolean> {
  return deps.data.enqueue({ userId: to.userId, kind, dedupeKey, payload: { ...message } });
}

/** internship.created → студентам, которым стажировка подходит (фильтры пройдены, совпадение не ниже порога). Возвращает число новых уведомлений. */
export async function onInternshipCreated(deps: NotifyDeps, { internshipId }: AppEvents['internship.created']): Promise<number> {
  const found = await deps.data.internship(internshipId);
  if (!found || found.internship.status !== 'open') return 0;
  const { internship, employer } = found;

  const [students, names] = await Promise.all([deps.data.studentsWithProfiles(employer?.ownerUserId), deps.skillNames()]);
  const company = employer?.companyName ?? internship.companyName ?? '';
  let queued = 0;
  for (const { user, profile } of students) {
    if (!reachable(user)) continue;
    const match = matchStudentToInternship(profile, internship);
    if (!shouldNotify(match, deps.threshold)) continue;
    const matchedSkills = [...match.mustMatched, ...match.niceMatched].map((c) => names.get(c) ?? c);
    const ok = await enqueue(
      deps,
      user,
      'internship_match',
      `internship:${internship.id}:student:${user.userId}`,
      internshipMatchMessage({ internshipId: internship.id, title: internship.title, company, score: match.score, matchedSkills }),
    );
    if (ok) queued++;
  }
  return queued;
}

/** interest.created со статусом interested → владельцу компании. */
export async function onInterestCreated(deps: NotifyDeps, e: AppEvents['interest.created']): Promise<number> {
  if (e.status !== 'interested') return 0;
  const ctx = await deps.data.interestContext(e.interestId);
  if (!ctx || !reachable(ctx.employerOwner)) return 0;
  const ok = await enqueue(
    deps,
    ctx.employerOwner,
    'new_candidate',
    `interest:${ctx.interest.id}:employer`,
    newCandidateMessage({ internshipId: ctx.internship.id, title: ctx.internship.title, score: ctx.interest.matchScore }),
  );
  return ok ? 1 : 0;
}

/** interest.invited → студенту контакт работодателя и чек-лист, работодателю контакт студента. */
export async function onInterestInvited(deps: NotifyDeps, e: AppEvents['interest.invited']): Promise<number> {
  const ctx = await deps.data.interestContext(e.interestId);
  if (!ctx) return 0;
  const { interest, internship, employer, student, employerOwner } = ctx;
  const company = employer?.companyName ?? internship.companyName ?? '';
  let queued = 0;

  if (reachable(student.user)) {
    const ok = await enqueue(
      deps,
      student.user,
      'invited_student',
      `invite:${interest.id}:student`,
      studentInvitedMessage({ internshipId: internship.id, title: internship.title, company, contactName: employer?.contactName ?? null, phone: employerOwner?.phone ?? null }),
    );
    if (ok) queued++;
  }

  if (reachable(employerOwner)) {
    const studentName = [student.user.firstName, student.lastName].filter(Boolean).join(' ') || 'Студент';
    const ok = await enqueue(
      deps,
      employerOwner,
      'invited_employer',
      `invite:${interest.id}:employer`,
      employerInvitedMessage({ internshipId: internship.id, title: internship.title, studentName, phone: student.phone, score: interest.matchScore }),
    );
    if (ok) queued++;
  }
  return queued;
}
