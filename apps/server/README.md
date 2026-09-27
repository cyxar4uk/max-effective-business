# Сервер: API мини-приложения и бот

Node.js 24 + TypeScript, Express 5, TypeORM + PostgreSQL. Один процесс обслуживает API и бота.
Контракт API — [docs/api.md](../../docs/api.md).

## Запуск для разработки

```bash
# из корня репозитория: БД в Docker (или docker compose up db), сервер локально
cp .env.example .env            # заполнить MAX_BOT_TOKEN, POSTGRES_PASSWORD, раскомментировать NODE_ENV и DATABASE_URL
cd apps/server
npm ci
npm run dev                     # миграции применяются при старте (RUN_MIGRATIONS=true)
```

Проверки перед PR: `npm run typecheck && npm run lint && npm test`.

Запрос от имени тестового пользователя MAX:

```bash
curl -H "X-Max-Init-Data: $(NODE_ENV=development npm run -s dev:init-data)" localhost:3000/api/me
```

## Устройство

```
src/
  index.ts     запуск: конфиг, БД, миграции, события, HTTP, остановка по SIGTERM
  app.ts       Express-приложение (createApp) и интерфейс Repos — всё, что API нужно от БД
  config.ts    переменные окружения с проверкой (zod)
  events.ts    внутренняя шина событий: API публикует, bot подписывается
  logger.ts    pino; initData, телефоны и заголовки авторизации не логируются
  api/         маршруты, единый формат ошибок                (Андрей)
  auth/        проверка подписи initData, middleware          (Андрей)
  db/          сущности, миграции, репозитории               (Андрей)
  bot/ matching/ import/ seed/                                (Тимур)
```

## Для модулей Тимура

- **События:** `events.on('internship.created', async ({ internshipId }) => …)`. Ошибка в обработчике логируется
  и не ломает запрос пользователя. Подключение — в `src/index.ts`, там оставлено место.
- **Данные:** сущности TypeORM в `src/db/entities.ts` (`Internship`, `StudentProfile`, `Interest`, `Notification`…),
  `DataSource` — `createDataSource()` из `src/db/dataSource.ts`. Нужен новый запрос или поле — скажи Андрею:
  схему меняем только миграциями.
- **Навыки** хранятся массивами кодов (`text[]`): `student_profiles.skills`, `internships.required_skills`,
  `internships.nice_skills`. Справочник — таблица `skills (code, name, group_name, sort)`.
- **Уведомления:** таблица `notifications` с `dedupe_key UNIQUE` — ключ идемпотентности, например
  `invite:<interestId>:student`, чтобы повтор события не отправил сообщение дважды.
- **Тестовые данные:** у всех таблиц с данными есть `is_demo`, у стажировок ещё `source = 'demo'`.
