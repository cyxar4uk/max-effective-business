import { pino, stdSerializers, type DestinationStream } from 'pino';

// Персональные данные и initData в логи не попадают
export const redactPaths = [
  'req.headers["x-max-init-data"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-max-bot-api-secret"]',
  '*.phone',
  '*.initData',
];

// Поля ошибок драйвера БД, в которых лежат данные запроса: SQL, параметры (телефоны, id MAX), «Key (…)=(…)»
const errorFieldsWithData = ['query', 'parameters', 'driverError', 'detail', 'where', 'internalQuery', 'internalPosition'];

type SerializedError = Record<string, unknown>;

function scrub(e: SerializedError): SerializedError {
  for (const key of errorFieldsWithData) delete e[key];
  if (e.cause && typeof e.cause === 'object') e.cause = scrub({ ...(e.cause as SerializedError) });
  return e;
}

export function safeErr(err: unknown): SerializedError {
  return scrub(stdSerializers.err(err as Error) as unknown as SerializedError);
}

export function createLogger(level: string, destination?: DestinationStream) {
  return pino({ level, redact: { paths: redactPaths, censor: '[скрыто]' }, serializers: { err: safeErr } }, destination);
}
