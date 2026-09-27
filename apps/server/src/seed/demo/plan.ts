import { matchStudentToInternship, DEFAULT_NOTIFY_THRESHOLD, type MatchResult } from '../../matching/index.js';
import type { DemoInternship, DemoStudent } from './data.js';

export type DemoInterestStatus = 'interested' | 'invited' | 'declined';

export interface DemoInterest {
  internship: string;
  student: string;
  status: DemoInterestStatus;
  match: MatchResult;
}

/** Сколько откликов заводим на стажировку. */
export const INTERESTS_PER_INTERNSHIP = 3;

/**
 * Отклики для демо. Процент не задаётся руками, а считается тем же расчётом, что и в продукте.
 * На каждую стажировку — три лучших подходящих студента с совпадением от порога.
 * Для стажировок из inviteKeys первый приглашён, третий получил отказ — так в демо видны все статусы.
 */
export function planDemoInterests(
  internships: readonly DemoInternship[],
  students: readonly DemoStudent[],
  inviteKeys: readonly string[],
): DemoInterest[] {
  return internships.flatMap((internship) => {
    const top = students
      .map((student, order) => ({ student, order, match: matchStudentToInternship(student, internship) }))
      .filter(({ match }) => match.passesFilters && match.score >= DEFAULT_NOTIFY_THRESHOLD)
      .sort((a, b) => b.match.score - a.match.score || a.order - b.order)
      .slice(0, INTERESTS_PER_INTERNSHIP);

    const withStatuses = inviteKeys.includes(internship.key);
    return top.map(({ student, match }, i): DemoInterest => {
      let status: DemoInterestStatus = 'interested';
      if (withStatuses && i === 0) status = 'invited';
      if (withStatuses && i === 2) status = 'declined';
      return { internship: internship.key, student: student.key, status, match };
    });
  });
}
