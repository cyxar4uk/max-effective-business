// Типы ответов API по docs/api.md. Навыки и теги — строковые коды, названия берём из справочников.

export type SkillCode = string;
export type TagCode = string;
export type WorkFormat = 'office' | 'remote' | 'hybrid';
export type InternshipType = 'practice' | 'internship' | 'part_time';
export type InternshipStatus = 'open' | 'closed';
export type InternshipSource = 'employer' | 'demo' | 'trudvsem' | 'career_center';
export type InterestStatus = 'interested' | 'skipped' | 'invited' | 'declined';
export type InterestAction = 'interested' | 'skipped';

export interface Consent {
  at: string;
  version: string;
}

export interface Me {
  id: number;
  firstName: string;
  lastName: string | null;
  hasPhone: boolean;
  consent: Consent | null;
  roles: { student: boolean; employer: boolean };
}

export interface Skill {
  code: SkillCode;
  name: string;
}

export interface SkillGroup {
  name: string;
  skills: Skill[];
}

export interface Skills {
  groups: SkillGroup[];
}

export interface Tag {
  code: TagCode;
  name: string;
  skills: SkillCode[];
}

/** Требование закрыто близким навыком наполовину (#71): нужен `need`, у студента есть `have`. */
export interface CloseSkill {
  need: SkillCode;
  have: SkillCode;
}

export interface Match {
  score: number;
  mustMatched: SkillCode[];
  /** Чего нет, в том числе закрытое близким навыком. */
  mustMissing: SkillCode[];
  niceMatched: SkillCode[];
  niceMissing: SkillCode[];
  /** Часть mustMissing / niceMissing, закрытая близким навыком. В откликах до #71 полей нет. */
  mustClose?: CloseSkill[];
  niceClose?: CloseSkill[];
}

/** «Место» в интерфейсе: стажировка, практика или подработка. */
export interface Internship {
  id: number;
  type: InternshipType;
  title: string;
  description: string | null;
  company: { name: string; city: string };
  requiredSkills: SkillCode[];
  niceSkills: SkillCode[];
  tags: TagCode[];
  format: WorkFormat;
  city: string | null;
  startsOn: string | null;
  endsOn: string | null;
  paid: boolean | null;
  salary: number | null;
  slots: number;
  status: InternshipStatus;
  source: InternshipSource;
  sourceUrl: string | null;
  isDemo: boolean;
  createdAt: string;
  /** Есть, если у пользователя есть анкета студента. */
  match?: Match;
  myInterest?: InterestStatus | null;
  isOwner?: boolean;
  /** Только в GET /api/employer/internships. */
  counts?: { interested: number; invited: number; declined: number };
}

/** Тело POST /api/internships; для PATCH — частично плюс status. */
export interface InternshipInput {
  type: InternshipType;
  title: string;
  description?: string | null;
  requiredSkills: SkillCode[];
  niceSkills?: SkillCode[] | null;
  tags?: TagCode[] | null;
  format: WorkFormat;
  city?: string | null;
  startsOn: string;
  endsOn: string;
  paid: boolean;
  salary?: number | null;
  slots: number;
}

export type InternshipPatch = Partial<InternshipInput> & { status?: InternshipStatus };

/** Ответ POST /api/internships/draft: черновик карточки места из текста работодателя. */
export interface PlaceDraftSuggestion {
  /** ai — от GigaChat; rules — по ключевым словам: «ИИ» в интерфейсе не пишем. */
  source: 'ai' | 'rules';
  title: string;
  tags: TagCode[];
  requiredSkills: SkillCode[];
  niceSkills: SkillCode[];
  /** null — из текста не понять: поле формы не трогаем. */
  type: InternshipType | null;
  format: WorkFormat | null;
}

export interface Interest {
  /** id отклика: по нему открываются документы для практики (F-16). В ответах до F-16 поля нет. */
  interestId?: number;
  status: InterestStatus;
  match: Match;
  updatedAt: string;
  internship: Internship;
  /** Только в статусе invited. */
  employerContact: { name: string; phone: string | null } | null;
}

export interface InterestResult {
  status: InterestStatus;
  match: Match;
}

export interface Candidate {
  /** id отклика: по нему открываются документы для практики (F-16). В ответах до F-16 поля нет. */
  interestId?: number;
  studentId: number;
  /** null — имени в MAX нет; поля анкеты — null, если анкету удалили после отклика. */
  firstName: string | null;
  /** Только в статусе invited. */
  lastName: string | null;
  university: string | null;
  course: number | null;
  direction: string | null;
  city: string | null;
  status: Exclude<InterestStatus, 'skipped'>;
  match: Match;
  /** Только в статусе invited; null — студент не делился номером. */
  phone: string | null;
  /** Первое «Интересно» (ISO). */
  interestedAt: string;
  isDemo: boolean;
}

export interface StudentProfile {
  university: string;
  faculty?: string | null;
  course: number;
  direction: string;
  city: string;
  formats: WorkFormat[];
  skills: SkillCode[];
  practiceMonth?: string | null;
  isDemo?: boolean;
}

/** Реквизиты для документов практики (F-16): все необязательные, пустое — null. */
export interface Requisites {
  legalName?: string | null;
  inn?: string | null;
  ogrn?: string | null;
  legalAddress?: string | null;
  signerName?: string | null;
  signerPosition?: string | null;
  signerBasis?: string | null;
  responsibleName?: string | null;
  responsiblePosition?: string | null;
  responsiblePhone?: string | null;
  responsibleEmail?: string | null;
}

export interface EmployerProfile extends Requisites {
  companyName: string;
  city: string;
  contactName: string;
  isDemo?: boolean;
}

export type DocKind = 'contract' | 'consent_letter' | 'task' | 'review';

export interface PracticeDoc {
  kind: DocKind;
  /** Подписанная ссылка без заголовка X-Max-Init-Data — для WebApp.downloadFile; null — нельзя скачать (нет реквизитов). */
  url?: string | null;
  fileName?: string;
}

/** Ответ GET /api/interests/:id/documents (F-16, контракт предложен в #143). */
export interface PracticeDocs {
  /** Чей это экран: работодателя (владелец места) или студента. */
  role?: 'employer' | 'student';
  internship?: { id: number; title: string; company: string };
  /** Реквизиты компании заполнены: договор и письмо можно скачать. */
  requisitesReady: boolean;
  items: PracticeDoc[];
}

export interface Items<T> {
  items: T[];
}
