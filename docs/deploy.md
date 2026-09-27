# Деплой

Владелец — Андрей. Прод — один VPS с Docker: Caddy (HTTPS) → `server` (API + вебхук бота) и `miniapp` (статика) →
PostgreSQL. Сертификат Let's Encrypt Caddy выпускает и продлевает сам.

```
MAX ──HTTPS:443──> Caddy ─┬─ /api/*, /bot/* ──> server:3000 ──> db:5432
                          └─ всё остальное ───> miniapp:80
```

Почему так:
- MAX принимает вебхук только по HTTPS на **порту 443** с сертификатом доверенного УЦ (самоподписанный не подходит)
  и только с `https://`-адресом мини-приложения ([подписки](https://dev.max.ru/docs-api/methods/POST/subscriptions)).
- Один домен для мини-приложения и API — не нужен CORS между доменами, один сертификат.
- Наружу открыты только 80 и 443. Сервер и БД в сеть не публикуются.

## Что нужно

- VPS: 1 vCPU, 1–2 ГБ RAM, Ubuntu 24.04, публичный IPv4, открыты порты 80 и 443.
- Домен или поддомен с A-записью на IP сервера.
- Токен бота от организаторов, ник бота.

## Первый запуск на сервере

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh

# 2. Репозиторий (приватный — нужен deploy key или токен с правом чтения)
git clone https://github.com/cyxar4uk/max-effective-business.git /opt/max-effective-business
cd /opt/max-effective-business

# 3. Переменные
cp .env.example .env
#   MAX_BOT_TOKEN, POSTGRES_PASSWORD (openssl rand -hex 24), MAX_WEBHOOK_SECRET (openssl rand -hex 32),
#   DOMAIN, ACME_EMAIL, SEED_DEMO=true
chmod 600 .env

# 4. Запуск
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
curl -s https://$DOMAIN/api/health     # {"status":"ok","db":"ok"}
```

## Если на сервере уже есть nginx или Caddy

Например, на машине уже живёт другое мини-приложение и порты 80/443 заняты его прокси. Тогда свой Caddy не
поднимаем, а встаём за существующий прокси:

1. Поддомен (например, `career.<домен>`) с A-записью на этот сервер; в `.env` — `DOMAIN=<поддомен>`,
   `SERVER_PORT` — свободный локальный порт (по умолчанию 3000).
2. Запуск: `docker compose -f compose.yaml -f compose.proxy.yaml up -d --build`.
   Сервер слушает только `127.0.0.1:$SERVER_PORT`, БД наружу не публикуется.
3. В существующий прокси добавить блок для поддомена:
   - nginx — [deploy/nginx.conf.example](../deploy/nginx.conf.example), сертификат — `certbot --nginx -d <поддомен>`;
   - Caddy — [deploy/Caddyfile.snippet](../deploy/Caddyfile.snippet), сертификат выпустит сам.
   В примерах сервер на порту 3000 — поменять, если `SERVER_PORT` другой.
4. Проверка: `node scripts/smoke.mjs https://<поддомен> --no-auth`.
5. Выкатка новых версий: `DEPLOY_MODE=proxy DEPLOY_HOST=… scripts/deploy.sh`.

Соседнее приложение не затрагивается: у нас свои контейнеры, сеть и тома Docker, из общего — только прокси.

Что узнать у владельца сервера заранее: SSH-доступ, какой прокси (nginx или Caddy, в Docker или на хосте),
свободная память (нужно ~500 МБ), установлен ли Docker Compose v2.24+.

## Подключить к MAX

1. **Вебхук:** `scripts/max-webhook.sh subscribe`, проверка — `scripts/max-webhook.sh list`.
   После подписки long polling с этим токеном перестаёт работать (одна среда на один токен).
2. **URL мини-приложения:** business.max.ru → «Чат-боты» → бот → ⋮ → «Настройки» → `https://<DOMAIN>`.

Проверка после запуска: `node scripts/smoke.mjs https://$DOMAIN --no-auth`.

## Выкатить новую версию

С любой машины, где есть SSH-доступ к серверу:

```bash
DEPLOY_HOST=deploy@<ip> scripts/deploy.sh          # main
DEPLOY_HOST=deploy@<ip> scripts/deploy.sh andrey/x # другая ветка — только для проверки
```

После выкатки — `node scripts/smoke.mjs https://<DOMAIN> --no-auth`.

Скрипт обновляет код до `origin/<ветка>`, пересобирает образы и перезапускает контейнеры. Миграции применяются
при старте сервера. Данные БД и сертификаты — в томах `db-data` и `caddy-data`, между выкатками не теряются.

## Если что-то сломалось

```bash
docker compose -f compose.yaml -f compose.prod.yaml ps
docker compose -f compose.yaml -f compose.prod.yaml logs --tail 100 server
docker compose -f compose.yaml -f compose.prod.yaml logs --tail 100 caddy   # проблемы с сертификатом
```

- Откат: `scripts/deploy.sh <предыдущий коммит или ветка>`; схема БД при этом не откатывается, миграции только добавляют.
- Сертификат не выпускается — проверить A-запись домена и что порт 80 открыт: Let's Encrypt проверяет по HTTP.
