import { describe, expect, it } from 'vitest';
import type { EnqueueInput, InterestContext, Recipient, StudentCandidate } from '../db/botData.js';
import type { Employer, Interest, Internship, StudentProfile } from '../db/entities.js';
import { DAILY_MATCH_LIMIT, dispatchDay, onDemoResponses, onInterestCreated, onInterestInvited, onInternshipCreated, serial, type NotifyDeps } from './notify.js';

const recipient = (userId: number, over: Partial<Recipient> = {}): Recipient => ({ userId, maxUserId: 1000 + userId, firstName: `U${userId}`, isDemo: false, ...over });

const internship = {
  id: 7, title: 'Аналитик', companyName: null, employerId: 1, status: 'open',
  requiredSkills: ['excel', 'sql'], niceSkills: ['power_bi'], format: 'remote', city: null,
} as unknown as Internship;
const employer = { id: 1, ownerUserId: 50, companyName: 'Луч', contactName: 'Олег Самойлов' } as unknown as Employer;

const student = (userId: number, skills: string[], over: Partial<Recipient> = {}): StudentCandidate => ({
  user: recipient(userId, over),
  profile: { userId, skills, formats: ['remote'], city: 'Москва' } as unknown as StudentProfile,
});

function deps(over: { students?: StudentCandidate[]; ctx?: InterestContext | null; seen?: Set<string>; today?: number; owner?: Recipient | null } = {}) {
  const queued: EnqueueInput[] = [];
  const seen = over.seen ?? new Set<string>();
  let excluded: number | undefined;
  const d: NotifyDeps = {
    threshold: 60,
    countInDispatchDay: async () => over.today ?? 0,
    now: () => new Date('2026-09-28T10:00:00Z'),
    skillNames: async () => new Map([['excel', 'Excel'], ['sql', 'SQL'], ['power_bi', 'Power BI']]),
    data: {
      internship: async (id) => (id === 7 ? { internship, employer } : null),
      studentsWithProfiles: async (ex) => ((excluded = ex), over.students ?? []),
      interestContext: async () => over.ctx ?? null,
      userById: async (id) => (over.owner !== undefined ? over.owner : id === 50 ? recipient(50) : null),
      enqueue: async (n) => {
        if (seen.has(n.dedupeKey)) return false;
        seen.add(n.dedupeKey);
        queued.push(n);
        return true;
      },
    },
  };
  return { d, queued, excluded: () => excluded };
}

describe('onInternshipCreated', () => {
  it('пишет только подходящим студентам с совпадением от порога, кроме автора и демо', async () => {
    const { d, queued, excluded } = deps({
      students: [
        student(1, ['excel', 'sql', 'power_bi']), // 100
        student(2, ['excel', 'sql']), // 70
        student(3, ['excel']), // 35 — ниже порога
        student(5, ['excel', 'power_bi']), // 65, но без обязательного SQL — не пишем (#82)
        student(4, ['excel', 'sql'], { isDemo: true, maxUserId: -2004 }), // демо
      ],
    });
    expect(await onInternshipCreated(d, { internshipId: 7 })).toBe(2);
    expect(excluded()).toBe(50);
    expect(queued.map((q) => [q.userId, q.dedupeKey])).toEqual([
      [1, 'internship:7:student:1'],
      [2, 'internship:7:student:2'],
    ]);
    expect(String(queued[0]!.payload.text)).toContain('Excel, SQL, Power BI');
  });

  it('повтор события не ставит уведомления второй раз', async () => {
    const seen = new Set<string>();
    const students = [student(1, ['excel', 'sql'])];
    expect(await onInternshipCreated(deps({ students, seen }).d, { internshipId: 7 })).toBe(1);
    expect(await onInternshipCreated(deps({ students, seen }).d, { internshipId: 7 })).toBe(0);
  });

  it('нет стажировки — ничего', async () => {
    expect(await onInternshipCreated(deps().d, { internshipId: 999 })).toBe(0);
  });
});

const ctx = (over: Partial<InterestContext> = {}): InterestContext => ({
  interest: { id: 30, matchScore: 85 } as Interest,
  internship,
  employer,
  student: { ...student(1, ['excel']), phone: '+70000002001', lastName: 'Соколова' },
  employerOwner: { ...recipient(50), phone: '+70000001001' },
  ...over,
});

describe('onInterestCreated', () => {
  it('interested → владельцу компании с процентом', async () => {
    const { d, queued } = deps({ ctx: ctx() });
    expect(await onInterestCreated(d, { interestId: 30, internshipId: 7, studentUserId: 1, status: 'interested' })).toBe(1);
    expect(queued[0]).toMatchObject({ userId: 50, kind: 'new_candidate', dedupeKey: 'interest:30:employer' });
    expect(String(queued[0]!.payload.text)).toContain('85 %');
  });

  it('skipped и работодатель-демо — без уведомления', async () => {
    expect(await onInterestCreated(deps({ ctx: ctx() }).d, { interestId: 30, internshipId: 7, studentUserId: 1, status: 'skipped' })).toBe(0);
    const demoOwner = ctx({ employerOwner: { ...recipient(50, { isDemo: true, maxUserId: -1001 }), phone: null } });
    expect(await onInterestCreated(deps({ ctx: demoOwner }).d, { interestId: 30, internshipId: 7, studentUserId: 1, status: 'interested' })).toBe(0);
  });
});

describe('onInterestInvited', () => {
  it('обоим: студенту контакт работодателя и чек-лист, работодателю контакт студента', async () => {
    const { d, queued } = deps({ ctx: ctx() });
    expect(await onInterestInvited(d, { interestId: 30, internshipId: 7, studentUserId: 1 })).toBe(2);
    const [toStudent, toEmployer] = queued;
    expect(toStudent).toMatchObject({ userId: 1, dedupeKey: 'invite:30:student' });
    expect(String(toStudent!.payload.text)).toContain('Олег Самойлов, +70000001001');
    expect(String(toStudent!.payload.text)).toContain('Что дальше:');
    expect(toEmployer).toMatchObject({ userId: 50, dedupeKey: 'invite:30:employer' });
    expect(String(toEmployer!.payload.text)).toContain('U1 Соколова, +70000002001');
  });

  it('приглашение от демо-компании — студенту прямо сказано, что место тестовое', async () => {
    const demoPlace = { ...internship, isDemo: true } as unknown as Internship;
    const { d, queued } = deps({ ctx: ctx({ internship: demoPlace }) });
    await onInterestInvited(d, { interestId: 30, internshipId: 7, studentUserId: 1 });
    expect(String(queued[0]!.payload.text)).toMatch(/^Тестовое приглашение: «Аналитик», Луч\.\n/);
    expect(String(queued[0]!.payload.text)).toContain('номер вымышленные');
    const real = deps({ ctx: ctx() });
    await onInterestInvited(real.d, { interestId: 30, internshipId: 7, studentUserId: 1 });
    expect(String(real.queued[0]!.payload.text)).toMatch(/^Вас приглашают: /);
    expect(String(real.queued[0]!.payload.text)).not.toContain('вымышленные');
  });

  it('демо-студент приглашён проверяющим — пишем только проверяющему', async () => {
    const demoStudent = ctx({ student: { ...student(1, ['excel'], { isDemo: true, maxUserId: -2001 }), phone: '+70000002001', lastName: 'Соколова' } });
    const { d, queued } = deps({ ctx: demoStudent });
    expect(await onInterestInvited(d, { interestId: 30, internshipId: 7, studentUserId: 1 })).toBe(1);
    expect(queued[0]!.userId).toBe(50);
  });
});

describe('onDemoResponses', () => {
  it('владельцу места — одно сообщение на все демо-отклики, повтор не дублирует', async () => {
    const seen = new Set<string>();
    const { d, queued } = deps({ seen });
    expect(await onDemoResponses(d, { internshipId: 7, count: 5 })).toBe(1);
    expect(queued[0]).toMatchObject({ userId: 50, kind: 'new_candidate', dedupeKey: 'demo-responses:7' });
    expect(String(queued[0]!.payload.text)).toBe(
      'На «Аналитик» откликнулись 5 тестовых студентов. Так будут приходить отклики: посмотрите, кто подходит, и пригласите.',
    );
    expect(await onDemoResponses(deps({ seen }).d, { internshipId: 7, count: 5 })).toBe(0);
  });

  it('склонение: 1 студент, 2 студента, 11 студентов, 21 студент', async () => {
    const text = async (count: number) => {
      const { d, queued } = deps();
      await onDemoResponses(d, { internshipId: 7, count });
      return String(queued[0]!.payload.text);
    };
    expect(await text(1)).toContain('откликнулся 1 тестовый студент.');
    expect(await text(2)).toContain('откликнулись 2 тестовых студента.');
    expect(await text(11)).toContain('откликнулись 11 тестовых студентов.');
    expect(await text(21)).toContain('откликнулся 21 тестовый студент.');
  });

  it('нет места, нет компании или владелец — демо: ничего', async () => {
    expect(await onDemoResponses(deps().d, { internshipId: 999, count: 3 })).toBe(0);
    expect(await onDemoResponses(deps({ owner: null }).d, { internshipId: 7, count: 3 })).toBe(0);
    expect(await onDemoResponses(deps({ owner: recipient(50, { isDemo: true, maxUserId: -1001 }) }).d, { internshipId: 7, count: 3 })).toBe(0);
  });
});

describe('лимит «не больше 3 новых мест в день»', () => {
  it('сверх лимита — не место, а одна подборка в сутки', async () => {
    const seen = new Set<string>();
    const students = [student(1, ['excel', 'sql'])];
    const first = deps({ students, seen, today: DAILY_MATCH_LIMIT });
    expect(await onInternshipCreated(first.d, { internshipId: 7 })).toBe(1);
    expect(first.queued[0]).toMatchObject({ userId: 1, kind: 'digest', dedupeKey: 'digest:1:2026-09-28' });
    // второе место сверх лимита в тот же день — подборка уже стоит, второй не будет
    expect(await onInternshipCreated(deps({ students, seen, today: DAILY_MATCH_LIMIT + 1 }).d, { internshipId: 7 })).toBe(0);
  });

  it('до лимита — обычное сообщение о месте', async () => {
    const { d, queued } = deps({ students: [student(1, ['excel', 'sql'])], today: DAILY_MATCH_LIMIT - 1 });
    await onInternshipCreated(d, { internshipId: 7 });
    expect(queued[0]!.kind).toBe('internship_match');
  });

  it('день рассылки — с 22:00 до 22:00 по Москве: опубликованное после 22:00 идёт в лимит следующего дня', () => {
    expect(dispatchDay(new Date('2026-09-28T09:00:00Z'))).toBe('2026-09-28'); // 12:00 МСК
    expect(dispatchDay(new Date('2026-09-28T18:59:00Z'))).toBe('2026-09-28'); // 21:59 МСК
    expect(dispatchDay(new Date('2026-09-28T19:00:00Z'))).toBe('2026-09-29'); // 22:00 МСК
    expect(dispatchDay(new Date('2026-09-28T21:30:00Z'))).toBe('2026-09-29'); // 00:30 МСК
    expect(dispatchDay(new Date('2026-09-29T05:00:00Z'))).toBe('2026-09-29'); // 08:00 МСК
  });

  it('подборка, поставленная в 22:30, и подборка утром — один ключ, вторая не создаётся', async () => {
    const seen = new Set<string>();
    const students = [student(1, ['excel', 'sql'])];
    const late = deps({ students, seen, today: DAILY_MATCH_LIMIT });
    late.d.now = () => new Date('2026-09-28T19:30:00Z'); // 22:30 МСК
    await onInternshipCreated(late.d, { internshipId: 7 });
    const morning = deps({ students, seen, today: DAILY_MATCH_LIMIT });
    morning.d.now = () => new Date('2026-09-29T05:00:00Z'); // 08:00 МСК
    expect(await onInternshipCreated(morning.d, { internshipId: 7 })).toBe(0);
    expect(late.queued[0]!.dedupeKey).toBe('digest:1:2026-09-29');
  });
});

describe('чек-лист по типу места', () => {
  it('практика — с документами практики', async () => {
    const practice = { ...internship, type: 'practice' } as unknown as Internship;
    const { d, queued } = deps({ ctx: ctx({ internship: practice }) });
    await onInterestInvited(d, { interestId: 30, internshipId: 7, studentUserId: 1 });
    expect(String(queued[0]!.payload.text)).toContain('885/390');
  });
});

describe('serial', () => {
  it('задачи идут строго по одной, ошибка не останавливает очередь', async () => {
    const run = serial();
    const log: string[] = [];
    const task = (name: string, ms: number, fail = false) => () =>
      new Promise<string>((resolve, reject) =>
        setTimeout(() => {
          log.push(name);
          if (fail) reject(new Error(name));
          else resolve(name);
        }, ms),
      );
    const results = await Promise.allSettled([run(task('a', 30)), run(task('b', 1, true)), run(task('c', 1))]);
    expect(log).toEqual(['a', 'b', 'c']);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });
});
