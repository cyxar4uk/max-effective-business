// POST /api/internships/draft — черновик карточки места из текста работодателя (docs/api.md «Черновик места»).
import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { DRAFT_LIMITS, type PlaceDrafter } from '../ai/index.js';
import { currentUser } from '../auth/middleware.js';
import { errorBody, parse } from './errors.js';

export interface DraftDeps {
  drafter: PlaceDrafter;
  /** Бросает ApiError FORBIDDEN, если у пользователя нет профиля компании. */
  assertEmployer: (userId: number) => Promise<void>;
  perHour: number;
}

const draftBody = z.object({
  text: z
    .string({ error: 'Опишите задачу текстом' })
    .trim()
    .min(10, 'Опишите задачу чуть подробнее — хотя бы пару слов')
    .max(DRAFT_LIMITS.text, `Не длиннее ${DRAFT_LIMITS.text} символов`)
    .refine((s) => !s.includes('\u0000'), 'Недопустимый символ'),
});

export function draftRouter({ drafter, assertEmployer, perHour }: DraftDeps): Router {
  const r = Router();

  const validate: RequestHandler = (req, _res, next) => {
    req.body = parse(draftBody, req.body);
    next();
  };
  const employerOnly: RequestHandler = async (req, _res, next) => {
    await assertEmployer(currentUser(req).id);
    next();
  };
  // Лимит на пользователя, а не на IP: в MAX у всех один и тот же клиент, а ключ GigaChat платный.
  // Считаются только запросы, прошедшие проверку тела и профиля компании.
  const limiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: perHour,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `draft:${currentUser(req).id}`,
    handler: (_req, res) => {
      res.status(429).json(errorBody('RATE_LIMITED', 'Черновиков на этот час больше нет. Заполните вручную или попробуйте позже'));
    },
  });

  // Без модели черновик по ключевым словам ничего не стоит — лимит в час не нужен
  const maybeLimit: RequestHandler = (req, res, next) => (drafter.ai ? limiter(req, res, next) : next());

  r.post('/internships/draft', validate, employerOnly, maybeLimit, async (req, res) => {
    const { text } = req.body as z.infer<typeof draftBody>;
    // Клиент закрыл соединение до ответа — запрос к модели больше не нужен
    const gone = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) gone.abort();
    });
    res.json(await drafter.draft(text, { signal: gone.signal }));
  });

  return r;
}
