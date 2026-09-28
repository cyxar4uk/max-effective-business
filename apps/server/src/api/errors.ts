import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

const statusByCode: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

// Единый формат ошибки API: { error: { code, message, fields? } }
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }

  get status(): number {
    return statusByCode[this.code];
  }
}

export function errorBody(code: ErrorCode, message: string, fields?: Record<string, string>) {
  return { error: fields ? { code, message, fields } : { code, message } };
}

// Разбор тела/параметров по схеме; ошибки — в поле fields по имени поля
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new ApiError('VALIDATION_ERROR', 'Проверьте заполнение полей', fields);
}

export const notFoundHandler: RequestHandler = () => {
  throw new ApiError('NOT_FOUND', 'Такого адреса нет');
};

// Ошибки пула и таймауты БД: сервис временно недоступен, а не ошибка кода
const dbUnavailable = /timeout exceeded when trying to connect|Query read timeout|Connection terminated|ECONNREFUSED/;

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json(errorBody(err.code, err.message, err.fields));
    return;
  }
  // Некорректный JSON в теле запроса
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json(errorBody('VALIDATION_ERROR', 'Тело запроса — некорректный JSON'));
    return;
  }
  // Тело больше лимита express.json (100 КБ) — ошибка клиента, а не сервера
  if (err?.type === 'entity.too.large') {
    res.status(413).json(errorBody('VALIDATION_ERROR', 'Слишком большой запрос'));
    return;
  }
  // Прочие ошибки клиента из body-parser и роутера (неизвестная кодировка, битый адрес и т. п.) несут свой 4xx.
  // Без стека в логе: иначе любой может забить журнал запросами без авторизации.
  const status = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : 0;
  if (status >= 400 && status < 500) {
    req.log.info({ status, type: err?.type }, 'Некорректный запрос');
    res.status(status).json(errorBody('VALIDATION_ERROR', 'Некорректный запрос'));
    return;
  }
  if (err instanceof Error && dbUnavailable.test(err.message)) {
    req.log.warn({ err }, 'БД недоступна');
    res.status(503).json(errorBody('INTERNAL', 'Сервис временно недоступен. Попробуйте через минуту'));
    return;
  }
  req.log.error({ err }, 'Необработанная ошибка');
  res.status(500).json(errorBody('INTERNAL', 'Что-то пошло не так. Попробуйте ещё раз'));
};
