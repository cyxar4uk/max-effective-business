// Клиент API сервера (docs/api.md). База — относительный /api: в проде мы на одном домене с сервером,
// в `npm run dev` его проксирует Vite на localhost:3000.
import { initData } from '../max/bridge';
import type {
  Candidate,
  DocKind,
  EmployerProfile,
  Interest,
  InterestAction,
  InterestResult,
  Internship,
  InternshipInput,
  InternshipPatch,
  Items,
  Me,
  PlaceDraftSuggestion,
  PracticeDocs,
  Skills,
  StudentProfile,
  Tag,
} from './types';

const BASE = '/api';

/** Версия текста согласия на обработку ПД. Сервер принимает только текущую (docs/api.md). */
export const CONSENT_VERSION = '2026-09-27';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'NETWORK';

/** Ошибка API. `message` написан сервером для пользователя — показываем как есть. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields: Record<string, string>;

  constructor(status: number, code: ApiErrorCode, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface ErrorBody {
  error?: { code?: ApiErrorCode; message?: string; fields?: Record<string, string> };
}

interface RequestOptions {
  /** Запрос доживёт до конца, даже если мини-приложение закрывают (решение по кандидату или пропуск места при уходе с экрана). */
  keepalive?: boolean;
}

async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Max-Init-Data': initData };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive: options.keepalive,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Нет связи с сервером. Проверьте интернет и повторите.');
  }

  const data: unknown = await res.json().catch(() => null);
  // Все ответы API — JSON; не JSON (страница прокси, index.html) — сервер недоступен
  if (!res.ok || data === null) {
    const err = (data as ErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL',
      err?.message ?? 'Сервер временно недоступен. Повторите чуть позже.',
      err?.fields ?? {},
    );
  }
  return data as T;
}

/** Документ .docx с заголовком X-Max-Init-Data — для скачивания вне MAX. Ошибка — тот же ApiError, что у JSON-запросов. */
async function getFile(path: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { headers: { 'X-Max-Init-Data': initData } });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Нет связи с сервером. Проверьте интернет и повторите.');
  }
  if (!res.ok) {
    const err = ((await res.json().catch(() => null)) as ErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL',
      err?.message ?? 'Сервер временно недоступен. Повторите чуть позже.',
      err?.fields ?? {},
    );
  }
  return res.blob();
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options);
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);

export const api = {
  me: () => get<Me>('/me'),
  consent: () => post<Me>('/me/consent', { version: CONSENT_VERSION }),
  /** Тело — ровно то, что вернул requestContact(). */
  phone: (contact: { phone: string; authDate: string; hash: string }) => post<Me>('/me/phone', contact),

  skills: () => get<Skills>('/skills'),
  tags: () => get<Items<Tag>>('/tags'),

  studentProfile: () => get<StudentProfile>('/student/profile'),
  saveStudentProfile: (profile: StudentProfile) => put<StudentProfile>('/student/profile', profile),
  feed: (tags: string[] = []) =>
    get<Items<Internship>>(tags.length ? `/student/feed?tags=${encodeURIComponent(tags.join(','))}` : '/student/feed'),
  interests: () => get<Items<Interest>>('/student/interests'),

  employerProfile: () => get<EmployerProfile>('/employer/profile'),
  saveEmployerProfile: (profile: EmployerProfile) => put<EmployerProfile>('/employer/profile', profile),
  employerInternships: () => get<Items<Internship>>('/employer/internships'),
  createInternship: (input: InternshipInput) => post<Internship>('/internships', input),
  /** Черновик карточки из текста своими словами (ИИ или ключевые слова). Лимит — 10 в час на пользователя. */
  placeDraft: (text: string) => post<PlaceDraftSuggestion>('/internships/draft', { text }),
  updateInternship: (id: number, change: InternshipPatch) => patch<Internship>(`/internships/${id}`, change),

  internship: (id: number) => get<Internship>(`/internships/${id}`),
  interest: (id: number, action: InterestAction, options?: RequestOptions) =>
    post<InterestResult>(`/internships/${id}/interest`, { action }, options),
  candidates: (id: number) => get<Items<Candidate>>(`/internships/${id}/candidates`),
  invite: (id: number, studentId: number, options?: RequestOptions) =>
    post<Candidate>(`/internships/${id}/candidates/${studentId}/invite`, undefined, options),
  decline: (id: number, studentId: number, options?: RequestOptions) =>
    post<Candidate>(`/internships/${id}/candidates/${studentId}/decline`, undefined, options),

  /** Документы для практики по отклику (F-16): только стороны приглашения, иначе 404. */
  practiceDocs: (interestId: number) => get<PracticeDocs>(`/interests/${interestId}/documents`),
  /** Без реквизитов компании договор и письмо — 409 с текстом, что заполнить. */
  practiceDoc: (interestId: number, kind: DocKind) => getFile(`/interests/${interestId}/documents/${kind}`),
};
