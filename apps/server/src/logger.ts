import { pino } from 'pino';

// Персональные данные и initData в логи не попадают
export const redactPaths = [
  'req.headers["x-max-init-data"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-max-bot-api-secret"]',
  '*.phone',
  '*.initData',
];

export function createLogger(level: string) {
  return pino({ level, redact: { paths: redactPaths, censor: '[скрыто]' } });
}
