import type { RequestHandler } from 'express';
import { ApiError } from '../api/errors.js';
import type { User } from '../db/entities.js';
import type { UsersRepo } from '../db/users.js';
import { validateInitData, type InitData } from './initData.js';

export const INIT_DATA_HEADER = 'x-max-init-data';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
    initData?: InitData;
  }
}

const messages = {
  MISSING: 'Откройте приложение из MAX',
  MALFORMED: 'Некорректные данные запуска',
  BAD_SIGNATURE: 'Данные запуска не прошли проверку',
  EXPIRED: 'Сессия устарела, перезапустите приложение',
  NO_USER: 'В данных запуска нет пользователя',
} as const;

// Проверяет подпись initData на каждом запросе и находит (или создаёт) пользователя
export function requireMaxUser(opts: { botToken: string; maxAgeSec: number; users: UsersRepo }): RequestHandler {
  return async (req, _res, next) => {
    const result = validateInitData(req.get(INIT_DATA_HEADER), opts.botToken, { maxAgeSec: opts.maxAgeSec });
    if (!result.ok) {
      // Для диагностики — только код причины (и возраст для EXPIRED), самих данных запуска в логе нет.
      // MISSING — обычный заход не из MAX, его не поднимаем до warn.
      const level = result.error === 'MISSING' ? 'info' : 'warn';
      req.log[level]({ initDataError: result.error, ...(result.ageSec !== undefined ? { initDataAgeSec: result.ageSec } : {}) }, 'initData отклонён');
      throw new ApiError('UNAUTHORIZED', messages[result.error]);
    }
    if (result.data.spacesAsPlus) req.log.info({ initDataEncoding: 'plus' }, 'initData: пробелы закодированы как «+»');
    req.initData = result.data;
    req.user = await opts.users.upsertFromMax(result.data.user);
    next();
  };
}

export function currentUser(req: { user?: User }): User {
  if (!req.user) throw new ApiError('UNAUTHORIZED', messages.MISSING);
  return req.user;
}
