import type { DataSource } from 'typeorm';
import { In } from 'typeorm';
import type { Employer, Interest, InterestStatus, Internship, MatchBreakdown, StudentProfile } from '../db/entities.js';
import { Employer as EmployerEntity } from '../db/entities.js';

export function studentProfileView(p: StudentProfile) {
  return {
    university: p.university,
    faculty: p.faculty,
    course: p.course,
    direction: p.direction,
    city: p.city,
    formats: p.formats,
    skills: p.skills,
    practiceMonth: p.practiceMonth,
    isDemo: p.isDemo,
  };
}

export function employerView(e: Employer) {
  return { companyName: e.companyName, city: e.city, contactName: e.contactName, isDemo: e.isDemo };
}

export function internshipView(
  i: Internship,
  employer: Employer | undefined,
  extra: { match?: MatchBreakdown; myInterest?: InterestStatus | null; isOwner?: boolean } = {},
) {
  return {
    id: i.id,
    type: i.type,
    title: i.title,
    description: i.description,
    company: { name: employer?.companyName ?? i.companyName ?? '', city: employer?.city ?? i.city },
    requiredSkills: i.requiredSkills,
    niceSkills: i.niceSkills,
    tags: i.tags,
    format: i.format,
    city: i.city,
    startsOn: i.startsOn,
    endsOn: i.endsOn,
    paid: i.paid,
    salary: i.salary,
    slots: i.slots,
    status: i.status,
    source: i.source,
    sourceUrl: i.sourceUrl,
    isDemo: i.isDemo,
    createdAt: i.createdAt.toISOString(),
    ...extra,
  };
}

export async function employersById(ds: DataSource, internships: Internship[]): Promise<Map<number, Employer>> {
  const ids = [...new Set(internships.map((i) => i.employerId).filter((id): id is number => id !== null))];
  if (!ids.length) return new Map();
  const list = await ds.getRepository(EmployerEntity).findBy({ id: In(ids) });
  return new Map(list.map((e) => [e.id, e]));
}

export function interestSummary(i: Interest) {
  return { status: i.status, match: i.match, updatedAt: i.updatedAt.toISOString() };
}
