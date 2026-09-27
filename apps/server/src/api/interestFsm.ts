import type { InterestStatus } from '../db/entities.js';

// Конечный автомат статусов отклика (docs/api.md, раздел «Отклик»):
//   (нет) → skipped | interested
//   skipped ↔ interested        — студент передумал, пока работодатель не решил
//   interested → invited | declined — решение работодателя, дальше статус не меняется

export type Transition =
  | { ok: true; next: InterestStatus; changed: boolean }
  | { ok: false; message: string };

export function studentAction(current: InterestStatus | null, action: 'interested' | 'skipped'): Transition {
  if (current === action) return { ok: true, next: action, changed: false };
  if (current === null || current === 'skipped' || current === 'interested') return { ok: true, next: action, changed: true };
  return {
    ok: false,
    message: current === 'invited' ? 'Работодатель уже пригласил вас на эту стажировку' : 'Работодатель уже ответил на этот отклик',
  };
}

export function employerAction(current: InterestStatus, action: 'invited' | 'declined'): Transition {
  if (current === action) return { ok: true, next: action, changed: false };
  if (current === 'interested') return { ok: true, next: action, changed: true };
  if (current === 'skipped') return { ok: false, message: 'Студент не откликался на эту стажировку' };
  return { ok: false, message: current === 'invited' ? 'Студент уже приглашён' : 'Студенту уже отказано' };
}
