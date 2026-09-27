import { Column, CreateDateColumn, Entity, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Типы колонок указаны явно: tsx/esbuild не выдаёт метаданные декораторов.
// Связи — через id-колонки, без relation-декораторов: проще с ESM и явнее в запросах.

export type WorkFormat = 'office' | 'remote' | 'hybrid';
export type InternshipStatus = 'open' | 'closed';
export type InternshipSource = 'employer' | 'demo' | 'trudvsem' | 'career_center';
export type InterestStatus = 'skipped' | 'interested' | 'invited' | 'declined';
export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface MatchBreakdown {
  score: number;
  mustMatched: string[];
  mustMissing: string[];
  niceMatched: string[];
  niceMissing: string[];
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id!: number;
  @Column({ name: 'max_user_id', type: 'bigint', unique: true }) maxUserId!: number;
  @Column({ name: 'first_name', type: 'text', nullable: true }) firstName!: string | null;
  @Column({ name: 'last_name', type: 'text', nullable: true }) lastName!: string | null;
  @Column({ type: 'text', nullable: true }) username!: string | null;
  @Column({ type: 'text', nullable: true }) phone!: string | null;
  @Column({ name: 'phone_saved_at', type: 'timestamptz', nullable: true }) phoneSavedAt!: Date | null;
  @Column({ name: 'consent_at', type: 'timestamptz', nullable: true }) consentAt!: Date | null;
  @Column({ name: 'consent_version', type: 'text', nullable: true }) consentVersion!: string | null;
  @Column({ name: 'is_demo', type: 'boolean', default: false }) isDemo!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity('skills')
export class Skill {
  @PrimaryColumn({ type: 'text' }) code!: string;
  @Column({ type: 'text' }) name!: string;
  @Column({ name: 'group_name', type: 'text' }) groupName!: string;
  @Column({ type: 'integer', default: 0 }) sort!: number;
}

@Entity('student_profiles')
export class StudentProfile {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' }) userId!: number;
  @Column({ type: 'text' }) university!: string;
  @Column({ type: 'text', nullable: true }) faculty!: string | null;
  @Column({ type: 'smallint' }) course!: number;
  @Column({ type: 'text' }) direction!: string;
  @Column({ type: 'text' }) city!: string;
  @Column({ type: 'text', array: true }) formats!: WorkFormat[];
  @Column({ type: 'text', array: true, default: () => "'{}'" }) skills!: string[];
  @Column({ name: 'is_demo', type: 'boolean', default: false }) isDemo!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity('employers')
export class Employer {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id!: number;
  @Column({ name: 'owner_user_id', type: 'bigint', unique: true }) ownerUserId!: number;
  @Column({ name: 'company_name', type: 'text' }) companyName!: string;
  @Column({ type: 'text' }) city!: string;
  @Column({ name: 'contact_name', type: 'text' }) contactName!: string;
  @Column({ name: 'is_demo', type: 'boolean', default: false }) isDemo!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity('internships')
export class Internship {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id!: number;
  @Column({ name: 'employer_id', type: 'bigint', nullable: true }) employerId!: number | null;
  @Column({ name: 'company_name', type: 'text', nullable: true }) companyName!: string | null;
  @Column({ type: 'text' }) title!: string;
  @Column({ type: 'text', default: '' }) description!: string;
  @Column({ name: 'required_skills', type: 'text', array: true, default: () => "'{}'" }) requiredSkills!: string[];
  @Column({ name: 'nice_skills', type: 'text', array: true, default: () => "'{}'" }) niceSkills!: string[];
  @Column({ type: 'text' }) format!: WorkFormat;
  @Column({ type: 'text', nullable: true }) city!: string | null;
  @Column({ name: 'starts_on', type: 'date', nullable: true }) startsOn!: string | null;
  @Column({ name: 'ends_on', type: 'date', nullable: true }) endsOn!: string | null;
  @Column({ type: 'integer', default: 1 }) slots!: number;
  @Column({ type: 'text', default: 'open' }) status!: InternshipStatus;
  @Column({ type: 'text', default: 'employer' }) source!: InternshipSource;
  @Column({ name: 'source_id', type: 'text', nullable: true }) sourceId!: string | null;
  @Column({ name: 'source_url', type: 'text', nullable: true }) sourceUrl!: string | null;
  @Column({ name: 'is_demo', type: 'boolean', default: false }) isDemo!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity('interests')
export class Interest {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id!: number;
  @Column({ name: 'student_user_id', type: 'bigint' }) studentUserId!: number;
  @Column({ name: 'internship_id', type: 'bigint' }) internshipId!: number;
  @Column({ type: 'text' }) status!: InterestStatus;
  @Column({ name: 'match_score', type: 'smallint' }) matchScore!: number;
  @Column({ type: 'jsonb' }) match!: MatchBreakdown;
  @Column({ name: 'is_demo', type: 'boolean', default: false }) isDemo!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id!: number;
  @Column({ name: 'user_id', type: 'bigint' }) userId!: number;
  @Column({ type: 'text' }) kind!: string;
  @Column({ name: 'dedupe_key', type: 'text', nullable: true, unique: true }) dedupeKey!: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) payload!: Record<string, unknown>;
  @Column({ type: 'text', default: 'pending' }) status!: NotificationStatus;
  @Column({ type: 'integer', default: 0 }) attempts!: number;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError!: string | null;
  @Column({ name: 'next_attempt_at', type: 'timestamptz', default: () => 'now()' }) nextAttemptAt!: Date;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true }) sentAt!: Date | null;
}

export const entities = [User, Skill, StudentProfile, Employer, Internship, Interest, Notification];
