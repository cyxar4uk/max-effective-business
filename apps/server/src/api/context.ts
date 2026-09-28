import type { DataSource } from 'typeorm';
import { In } from 'typeorm';
import type { User } from '../db/entities.js';
import { Employer, Internship, Skill, StudentProfile, TaskTag } from '../db/entities.js';
import type { EventBus } from '../events.js';
import { ApiError } from './errors.js';
import type { Matcher } from './matcher.js';

export interface DomainDeps {
  ds: DataSource;
  matcher: Matcher;
  events: EventBus;
}

export function requireConsent(user: User): void {
  if (!user.consentAt) throw new ApiError('FORBIDDEN', 'Сначала дайте согласие на обработку персональных данных');
}

export async function requireStudent(ds: DataSource, userId: number): Promise<StudentProfile> {
  const profile = await ds.getRepository(StudentProfile).findOneBy({ userId });
  if (!profile) throw new ApiError('FORBIDDEN', 'Сначала заполните анкету студента');
  return profile;
}

export async function requireEmployer(ds: DataSource, userId: number): Promise<Employer> {
  const employer = await ds.getRepository(Employer).findOneBy({ ownerUserId: userId });
  if (!employer) throw new ApiError('FORBIDDEN', 'Сначала заполните профиль компании');
  return employer;
}

// Стажировка текущего работодателя; чужая — 404, чтобы не раскрывать, что она есть
export async function ownInternship(ds: DataSource, userId: number, id: number): Promise<{ internship: Internship; employer: Employer }> {
  const employer = await ds.getRepository(Employer).findOneBy({ ownerUserId: userId });
  const internship = employer ? await ds.getRepository(Internship).findOneBy({ id, employerId: employer.id }) : null;
  if (!employer || !internship) throw new ApiError('NOT_FOUND', 'Стажировка не найдена');
  return { internship, employer };
}

// Навыки только из справочника: свободный текст не сравнивается
export async function assertSkills(ds: DataSource, lists: Record<string, string[]>): Promise<void> {
  const all = [...new Set(Object.values(lists).flat())];
  if (!all.length) return;
  const known = new Set((await ds.getRepository(Skill).findBy({ code: In(all) })).map((s) => s.code));
  const fields: Record<string, string> = {};
  for (const [field, codes] of Object.entries(lists)) {
    const unknown = codes.filter((c) => !known.has(c));
    if (unknown.length) fields[field] = `Нет в справочнике: ${unknown.join(', ')}`;
  }
  if (Object.keys(fields).length) throw new ApiError('VALIDATION_ERROR', 'Выберите навыки из справочника', fields);
}

// Теги задач — только из справочника task_tags
export async function assertTags(ds: DataSource, tags: string[]): Promise<void> {
  if (!tags.length) return;
  const known = new Set((await ds.getRepository(TaskTag).findBy({ code: In(tags) })).map((t) => t.code));
  const unknown = tags.filter((t) => !known.has(t));
  if (unknown.length) throw new ApiError('VALIDATION_ERROR', 'Выберите теги из списка', { tags: `Нет в справочнике: ${unknown.join(', ')}` });
}
