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
  req.log.error({ err }, 'Необработанная ошибка');
  res.status(500).json(errorBody('INTERNAL', 'Что-то пошло не так. Попробуйте ещё раз'));
};
