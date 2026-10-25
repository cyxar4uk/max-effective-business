// Документы для практики (F-16): список и .docx по отклику. Скачать могут только две стороны приглашения,
// только в статусе invited и только по месту с типом «практика» — иначе 404, как будто отклика нет.
// В лог не пишем ни имён, ни реквизитов, ни текста документа: только id отклика и вид документа.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { DataSource } from 'typeorm';
import { z } from 'zod';
import { currentUser } from '../auth/middleware.js';
import { buildDoc, DOC_KINDS, DOC_TITLES, NEEDS_REQUISITES, vuzFor, type CompanyData, type DocData, type DocKind } from '../docs/templates.js';
import { ApiError, parse } from './errors.js';

/** Подписанная ссылка живёт 15 минут: MAX качает файл сам, без заголовка X-Max-Init-Data (контракт в #143). */
export const LINK_TTL_SEC = 15 * 60;

const idParam = z.coerce.number().int().positive();
const kindParam = z.enum(DOC_KINDS);

interface Row {
  id: number;
  status: string;
  student_user_id: number;
  internship_id: number;
  title: string;
  type: string;
  format: string;
  city: string | null;
  starts_on: string | null;
  ends_on: string | null;
  owner_user_id: number;
  company_name: string;
  employer_city: string;
  legal_name: string | null;
  inn: string | null;
  ogrn: string | null;
  legal_address: string | null;
  signer_name: string | null;
  signer_position: string | null;
  signer_basis: string | null;
  responsible_name: string | null;
  responsible_position: string | null;
  responsible_phone: string | null;
  responsible_email: string | null;
  first_name: string | null;
  last_name: string | null;
  university: string | null;
  course: number | null;
  direction: string | null;
}

type Role = 'employer' | 'student';

/** Реквизиты для договора и письма: все обязательные из спеки заполнены — иначе null. */
function companyOf(r: Row): CompanyData | null {
  const required = [r.legal_name, r.inn, r.ogrn, r.legal_address, r.signer_name, r.signer_position, r.signer_basis, r.responsible_name, r.responsible_position];
  if (required.some((v) => !v?.trim())) return null;
  return {
    legalName: r.legal_name!,
    inn: r.inn!,
    ogrn: r.ogrn!,
    legalAddress: r.legal_address!,
    signerName: r.signer_name!,
    signerPosition: r.signer_position!,
    signerBasis: r.signer_basis!,
    responsibleName: r.responsible_name!,
    responsiblePosition: r.responsible_position!,
    responsiblePhone: r.responsible_phone,
    responsibleEmail: r.responsible_email,
  };
}

/** Где проходит практика: удалённо — «дистанционно», иначе юр. адрес компании (или город места). */
function placeAddress(r: Row): string {
  if (r.format === 'remote') return 'дистанционно';
  const city = r.city ?? r.employer_city;
  if (r.legal_address?.trim()) return r.legal_address.includes(city) ? r.legal_address : `г. ${city}, ${r.legal_address}`;
  return `г. ${city}`;
}

function docData(r: Row, today: Date): DocData {
  const company = companyOf(r);
  return {
    company,
    companyName: r.company_name,
    vuz: vuzFor(r.university),
    student: {
      fullName: [r.last_name, r.first_name].filter(Boolean).join(' ') || '____________',
      program: r.direction ?? '',
      course: r.course,
    },
    place: { title: r.title, city: r.city ?? r.employer_city, start: r.starts_on, end: r.ends_on, address: placeAddress(r) },
    date: today.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }),
  };
}

const fileName = (kind: DocKind) => `${DOC_TITLES[kind]}.docx`;

export interface PracticeDocsDeps {
  ds: DataSource;
  /** Ключ подписи ссылок (выводится из токена бота в app.ts). */
  linkSecret: string;
  /** https-origin мини-приложения: ссылка для WebApp.downloadFile должна быть абсолютной. Нет — ссылок нет. */
  publicOrigin: string | null;
  now?: () => Date;
}

export function createPracticeDocs({ ds, linkSecret, publicOrigin, now = () => new Date() }: PracticeDocsDeps) {
  /** Отклик и роль пользователя в нём. Чужой, не приглашён или не практика — 404. */
  async function load(interestId: number, userId: number): Promise<{ row: Row; role: Role }> {
    const [row] = (await ds.query(
      `SELECT i.id, i.status, i.student_user_id, it.id AS internship_id, it.title, it.type, it.format, it.city,
              to_char(it.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(it.ends_on, 'YYYY-MM-DD') AS ends_on,
              e.owner_user_id, e.company_name, e.city AS employer_city, e.legal_name, e.inn, e.ogrn, e.legal_address,
              e.signer_name, e.signer_position, e.signer_basis, e.responsible_name, e.responsible_position,
              e.responsible_phone, e.responsible_email,
              u.first_name, u.last_name, sp.university, sp.course, sp.direction
       FROM interests i
       JOIN internships it ON it.id = i.internship_id
       JOIN employers e ON e.id = it.employer_id
       JOIN users u ON u.id = i.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = i.student_user_id
       WHERE i.id = $1`,
      [interestId],
    )) as Row[];
    const role: Role | null = !row ? null : row.owner_user_id === userId ? 'employer' : row.student_user_id === userId ? 'student' : null;
    if (!row || !role || row.status !== 'invited' || row.type !== 'practice') {
      throw new ApiError('NOT_FOUND', 'Документов для этого отклика нет');
    }
    return { row, role };
  }

  const sign = (payload: string) => createHmac('sha256', linkSecret).update(payload).digest('base64url');

  /** Ссылка без заголовков: id отклика, вид, кто качает и до какого времени — под HMAC. */
  function signedUrl(interestId: number, kind: DocKind, userId: number): string | null {
    if (!publicOrigin) return null;
    const exp = Math.floor(now().getTime() / 1000) + LINK_TTL_SEC;
    const payload = `${interestId}.${kind}.${userId}.${exp}`;
    return `${publicOrigin}/api/practice-files/${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
  }

  /** Токен ссылки → что качать; подделка или просрочка — 404. */
  function verify(token: string): { interestId: number; kind: DocKind; userId: number } {
    const [body, sig] = token.split('.');
    const payload = body ? Buffer.from(body, 'base64url').toString() : '';
    const expected = Buffer.from(sign(payload));
    const got = Buffer.from(sig ?? '');
    const [id, kind, user, exp] = payload.split('.');
    const parsedKind = kindParam.safeParse(kind);
    const numbers = [id, user, exp].every((v) => v !== undefined && /^\d{1,15}$/.test(v));
    if (
      got.length !== expected.length ||
      !timingSafeEqual(got, expected) ||
      !parsedKind.success ||
      !numbers ||
      Number(exp) < now().getTime() / 1000
    ) {
      throw new ApiError('NOT_FOUND', 'Ссылка устарела. Откройте документы в приложении ещё раз');
    }
    return { interestId: Number(id), kind: parsedKind.data, userId: Number(user) };
  }

  async function send(req: Request, res: Response, interestId: number, kind: DocKind, userId: number): Promise<void> {
    const { row } = await load(interestId, userId);
    const data = docData(row, now());
    if (NEEDS_REQUISITES.has(kind) && !data.company) {
      throw new ApiError(
        'CONFLICT',
        'Компания ещё не заполнила реквизиты для документов: полное наименование, ИНН, ОГРН, адрес, кто подписывает и ответственный за практику',
      );
    }
    const buf = await buildDoc(kind, data);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="document.docx"; filename*=UTF-8''${encodeURIComponent(fileName(kind))}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
    req.log.info({ interestId, kind }, 'Документ практики выдан');
  }

  /** За проверкой initData: список и скачивание с заголовком X-Max-Init-Data. */
  const authed = Router();
  authed.get('/interests/:id/documents', async (req, res) => {
    const user = currentUser(req);
    const { row, role } = await load(parse(idParam, req.params.id), user.id);
    const ready = companyOf(row) !== null;
    res.json({
      role,
      internship: { id: row.internship_id, title: row.title, company: row.company_name },
      requisitesReady: ready,
      items: DOC_KINDS.map((kind) => ({
        kind,
        fileName: fileName(kind),
        url: NEEDS_REQUISITES.has(kind) && !ready ? null : signedUrl(row.id, kind, user.id),
      })),
    });
  });
  authed.get('/interests/:id/documents/:kind', async (req, res) => {
    await send(req, res, parse(idParam, req.params.id), parse(kindParam, req.params.kind), currentUser(req).id);
  });

  /** До проверки initData: файл по подписанной ссылке для WebApp.downloadFile. Доступ проверяем заново. */
  const files = Router();
  files.get('/practice-files/:token', async (req, res) => {
    const { interestId, kind, userId } = verify(req.params.token);
    await send(req, res, interestId, kind, userId);
  });

  return { authed, files, signedUrl, verify };
}
