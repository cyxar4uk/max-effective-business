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
2. Запуск:
   ```bash
   docker network create meb-edge        # один раз: общая сеть с прокси, живёт независимо от обоих стеков
   docker compose -f compose.yaml -f compose.proxy.yaml up -d --build
   ```
   Сервер слушает `127.0.0.1:$SERVER_PORT` и сеть `meb-edge` (алиас `meb-server`); БД — только в своей сети.
3. В существующий прокси добавить блок для поддомена — смотря где прокси:

   | Прокси | Как ходит к серверу | Пример |
   |---|---|---|
   | nginx на хосте | `127.0.0.1:3000` | [deploy/nginx.conf.example](../deploy/nginx.conf.example), сертификат — `certbot --nginx -d <поддомен>` |
   | nginx в контейнере | подключить контейнер к `meb-edge`, `meb-server:3000` | [deploy/nginx-docker.conf.example](../deploy/nginx-docker.conf.example) |
   | Caddy (хост или контейнер) | `127.0.0.1:3000` или `meb-server:3000` | [deploy/Caddyfile.snippet](../deploy/Caddyfile.snippet), сертификат выпустит сам |

   Подключить контейнер прокси к сети: `docker network connect meb-edge <контейнер>`. Если прокси поднимается
   через compose соседнего проекта — лучше прописать сеть там (`networks: [default, meb-edge]` у сервиса и
   `meb-edge: { external: true }`), иначе подключение пропадёт при пересоздании контейнера.
   **Важно для nginx в контейнере:** адрес `meb-server` должен разрешаться при каждом запросе (`resolver 127.0.0.11`
   и переменная в `proxy_pass`, как в примере). Иначе nginx не запустится, пока наш сервер лежит, — вместе с
   соседними сайтами.
4. Проверка: `node scripts/smoke.mjs https://<поддомен> --no-auth`.
5. Выкатка новых версий: `DEPLOY_MODE=proxy DEPLOY_HOST=… scripts/deploy.sh` (сеть `meb-edge` скрипт создаст сам).

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
DEPLOY_HOST=deploy@<ip> scripts/deploy.sh             # main
DEPLOY_HOST=deploy@<ip> scripts/deploy.sh andrey/x    # другая ветка — только для проверки
DEPLOY_HOST=deploy@<ip> scripts/deploy.sh 4672af1     # конкретный коммит — откат
DEPLOY_MODE=proxy DEPLOY_HOST=deploy@<ip> scripts/deploy.sh   # за чужим прокси (сервер Ильи)
```

После выкатки — `node scripts/smoke.mjs https://<DOMAIN> --no-auth`.

Скрипт переключает код на `origin/<ветка>` (или на указанный коммит), пересобирает образы и перезапускает контейнеры. Миграции применяются
при старте сервера. Данные БД и сертификаты — в томах `db-data` и `caddy-data`, между выкатками не теряются.

## Если что-то сломалось

```bash
O=compose.prod.yaml     # свой Caddy; за чужим прокси — O=compose.proxy.yaml
docker compose -f compose.yaml -f $O ps
docker compose -f compose.yaml -f $O logs --tail 100 server
docker compose -f compose.yaml -f $O logs --tail 100 caddy     # только со своим Caddy: проблемы с сертификатом
docker network inspect meb-edge --format '{{range .Containers}}{{.Name}} {{end}}'   # за прокси в Docker: кто в общей сети
```

- Откат: `scripts/deploy.sh <хеш коммита>` (с `DEPLOY_MODE=proxy` для сервера Ильи); схема БД при этом не
  откатывается, миграции только добавляют.
- За прокси в Docker 502 на нашем поддомене — проверить, что контейнер прокси в сети `meb-edge` (команда выше).
- Сертификат не выпускается — проверить A-запись домена и что порт 80 открыт: Let's Encrypt проверяет по HTTP.
