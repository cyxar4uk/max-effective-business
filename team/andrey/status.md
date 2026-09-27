# Статус: Андрей

Обновлено: 27.09.2026, вечер

## Сделано

- Каркас `apps/server` (ветка `andrey/server-skeleton`, PR в `main`): Node 24 + TypeScript, Express 5, TypeORM,
  zod, pino, vitest, ESLint. Команды: `npm run dev|build|test|typecheck|lint`.
- Схема БД — первая миграция: `users`, `skills`, `student_profiles`, `employers`, `internships`, `interests`,
  `notifications`. Миграции применяются при старте сервера. Проверено на PostgreSQL 18.
- Проверка подписи `initData` по dev.max.ru на каждом запросе к `/api`, заголовок `X-Max-Init-Data`, 12 юнит-тестов
  (включая эталонный вектор, посчитанный отдельно на Python).
- Скрипт режима разработки `npm run dev:init-data` — подписанный `initData` для браузера и curl.
- Готовы эндпоинты: `GET /api/health`, `GET /api/me`, `POST /api/me/consent`, `GET /api/skills`.
- Единый формат ошибок, лимит запросов, CORS по `MINIAPP_URL`, helmet; в логах нет `initData` и заголовков.
- Внутренняя шина событий `src/events.ts` для модуля бота.
- Контракт API — `docs/api.md` (черновик на согласование).
- `Dockerfile` сервера, `compose.yaml` (`db` + `server`), `.env.example` со всеми переменными, CI на GitHub Actions.

## Сейчас делаю

- Согласование `docs/api.md` с Ильёй и Тимуром.

## Дальше

- Эндпоинты студента и работодателя по контракту, права доступа, конечный автомат откликов, публикация событий.
- `POST /api/me/phone` — после уточнения, как `requestContact` отдаёт номер.
- Подключить `miniapp` в compose, когда Илья добавит `apps/miniapp`.
- Деплой с HTTPS (задача 4).

## Блокеры

- Локально `docker compose up --build` не собирается: из Docker на моей машине npm не успевает скачать пакеты
  (ETIMEDOUT, похоже на VPN/прокси). Сервер проверен локально против PostgreSQL в Docker. Сборку образа проверит CI
  и чужая машина.

## Нужно от других

- Илья · посмотреть `docs/api.md` (форматы ответов под экраны) и формат `requestContact` в MAX · 28.09 утро
- Тимур · формат `match` в `docs/api.md`, какие запросы к БД нужны боту и сиду; подключение модулей — `apps/server/README.md` · 28.09 утро
- Артём · токен бота от организаторов и ответ, есть ли отдельный бот для разработки · 28.09

## Идеи на потом
<!-- всё, что не входит в Must/Should, записываем сюда и не делаем -->
