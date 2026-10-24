# Деплой

Владелец — Андрей. Прод — один VPS с Docker: Caddy (HTTPS) → `meb-server` (API + вебхук бота) и `meb-miniapp` (статика) →
PostgreSQL. Сертификат Let's Encrypt Caddy выпускает и продлевает сам.

```
MAX ──HTTPS:443──> Caddy ─┬─ /api/*, /bot/* ──> meb-server:3000 ──> db:5432
                          └─ всё остальное ───> meb-miniapp:80
```

Почему так:
- MAX принимает вебхук только по HTTPS на **порту 443** с сертификатом доверенного УЦ (самоподписанный не подходит)
  и только с `https://`-адресом мини-приложения ([подписки](https://dev.max.ru/docs-api/methods/POST/subscriptions)).
- Один домен для мини-приложения и API — не нужен CORS между доменами, один сертификат.
- Наружу открыты только 80 и 443. Сервер, мини-приложение и БД в сеть не публикуются.

## Что нужно

- VPS: 1 vCPU, 1–2 ГБ RAM, Ubuntu 24.04, публичный IPv4, открыты порты 80 и 443.
- Домен или поддомен с A-записью на IP сервера.
- Токен бота от организаторов, ник бота.

## Первый запуск на сервере

```bash
# 1. Docker; при 2 ГБ памяти и меньше — ещё своп на 2 ГБ, иначе сборка образов может не уместиться
curl -fsSL https://get.docker.com | sh

# 2. Репозиторий — клон по SSH с deploy key, см. «Доступ к репозиторию на сервере» ниже
cd /opt/max-effective-business

# 3. Переменные
cp .env.example .env
#   MAX_BOT_TOKEN, POSTGRES_PASSWORD (openssl rand -hex 24), MAX_WEBHOOK_SECRET (openssl rand -hex 32),
#   DOMAIN, ACME_EMAIL, SEED_DEMO=true
chmod 600 .env

# 4. Запуск
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
curl -s https://<DOMAIN>/api/health     # {"status":"ok","db":"ok"}
```

## Доступ к репозиторию на сервере

Репозиторий приватный, а `scripts/deploy.sh` делает `git fetch` по SSH без терминала — пароль или токен там не
ввести. Один раз, на сервере под пользователем деплоя (он в группе `docker`):

```bash
ssh-keygen -t ed25519 -N '' -f ~/.ssh/meb_deploy -C meb-deploy
cat ~/.ssh/meb_deploy.pub
# владелец репозитория добавляет ключ: GitHub → репозиторий → Settings → Deploy keys, без права записи
sudo install -d -o "$USER" /opt/max-effective-business
GIT_SSH_COMMAND='ssh -i ~/.ssh/meb_deploy -o IdentitiesOnly=yes' \
  git clone git@github.com:cyxar4uk/max-effective-business.git /opt/max-effective-business
git -C /opt/max-effective-business config core.sshCommand 'ssh -i ~/.ssh/meb_deploy -o IdentitiesOnly=yes'
```

Ключ даёт доступ только к этому репозиторию и только на чтение. Пока его не добавили — запасной путь без ключей на
сервере: зайти `ssh -A <user>@<host>`, клонировать `git@github.com:…` своим ключом через ssh-agent и выкатывать с
`DEPLOY_FORWARD_AGENT=1 scripts/deploy.sh`. Пока открыта сессия, root сервера может пользоваться вашим агентом —
годится только для сервера своей команды.

## Если на сервере уже есть nginx или Caddy

Например, на машине уже живёт другое мини-приложение и порты 80/443 заняты его прокси. Тогда свой Caddy не
поднимаем, а встаём за существующий прокси:

1. Поддомен (например, `career.<домен>`) с A-записью на этот сервер; в `.env` — `DOMAIN=<поддомен>`,
   `SERVER_PORT` и `MINIAPP_PORT` — свободные локальные порты (по умолчанию 3000 и 8080; на сервере с другим
   мини-приложением 8080 часто занят; проверить — `ss -ltn`), те же порты — в блоке прокси.
2. Запуск:
   ```bash
   docker network create meb-edge        # один раз: общая сеть с прокси, живёт независимо от обоих стеков
   docker compose -f compose.yaml -f compose.proxy.yaml up -d --build
   ```
   Сервер слушает `127.0.0.1:$SERVER_PORT`, мини-приложение — `127.0.0.1:$MINIAPP_PORT`; оба есть в сети `meb-edge`
   (имена `meb-server` и `meb-miniapp`); БД — только в своей сети.
3. В существующий прокси добавить блок для поддомена — смотря где прокси:

   | Прокси | Куда ходит: `/api/*` и `/bot/*` · остальное | Пример |
   |---|---|---|
   | nginx на хосте | `127.0.0.1:$SERVER_PORT` · `127.0.0.1:$MINIAPP_PORT` | [deploy/nginx.conf.example](../deploy/nginx.conf.example), сертификат — `certbot --nginx -d <поддомен>` |
   | nginx в контейнере | подключить контейнер к `meb-edge`; `meb-server:3000` · `meb-miniapp:80` | [deploy/nginx-docker.conf.example](../deploy/nginx-docker.conf.example) |
   | Caddy (хост или контейнер) | как у nginx на хосте или в контейнере | [deploy/Caddyfile.snippet](../deploy/Caddyfile.snippet), сертификат выпустит сам |

   В примерах для прокси на хосте стоят `127.0.0.1:3000` и `127.0.0.1:8080` — поменять на свои `SERVER_PORT` и
   `MINIAPP_PORT`; внутри сети `meb-edge` порты всегда 3000 и 80.

   Подключить контейнер прокси к сети: `docker network connect meb-edge <контейнер>`. Если прокси поднимается
   через compose соседнего проекта — лучше прописать сеть там (`networks: [default, meb-edge]` у сервиса и
   `meb-edge: { external: true }`), иначе подключение пропадёт при пересоздании контейнера.
   **Не перехватить соседей:** Docker ищет имя сразу во всех сетях контейнера, а Compose регистрирует в них имена
   сервисов. Поэтому наши сервисы называются `meb-server` и `meb-miniapp`, а не `server` и `miniapp`. Проверка: до и
   после `docker network connect` имя бэкенда соседей из их конфига прокси разрешается в тот же адрес —
   `docker exec <контейнер> getent hosts <имя>`.
   **Важно для nginx в контейнере:** адреса `meb-server` и `meb-miniapp` должны разрешаться при каждом запросе
   (`resolver 127.0.0.11` и переменные в `proxy_pass`, как в примере). Иначе nginx не запустится, пока наши
   контейнеры лежат, — вместе с соседними сайтами.
4. Проверка: `node scripts/smoke.mjs https://<поддомен> --no-auth`.
5. Выкатка новых версий: `DEPLOY_MODE=proxy DEPLOY_HOST=… scripts/deploy.sh` (сеть `meb-edge` скрипт создаст сам).

Соседнее приложение не затрагивается: у нас свои контейнеры, сеть и тома Docker, из общего — только прокси.

Что узнать у владельца сервера заранее: SSH-доступ (пользователь в группе `docker`), какой прокси (nginx или Caddy,
в Docker или на хосте), свободная память (нужно ~500 МБ), установлен ли Docker Compose v2.24+. Владельца
репозитория — добавить deploy key (см. выше).

## Сервер уже выкачен, мини-приложение добавилось позже

Порядок на сервере с чужим прокси, если сначала выкатили только сервер (до `apps/miniapp` в `main`):

1. Свободный порт под мини-приложение: `ss -ltn`; в `.env` на сервере — `MINIAPP_PORT=<порт>` (по умолчанию 8080,
   на сервере с другим мини-приложением он часто занят).
2. Выкатить: `DEPLOY_MODE=proxy DEPLOY_HOST=… scripts/deploy.sh`, проверить `docker compose -f compose.yaml
   -f compose.proxy.yaml ps` — `meb-miniapp` в статусе healthy.
3. В прокси соседа `location /` (или `handle` у Caddy) — на `127.0.0.1:$MINIAPP_PORT` (прокси на хосте) или
   `meb-miniapp:80` (прокси в Docker), как в обновлённых примерах из `deploy/`. Проверить и применить через
   `nginx -t` + reload или `caddy validate` + `caddy reload`.
4. `node scripts/smoke.mjs https://<поддомен> --no-auth` — теперь проверяет и мини-приложение; открыть
   `https://<поддомен>/` в браузере и убедиться, что это наше приложение, а не соседнее.
5. Прописать URL мини-приложения в настройках бота (ниже).

## Подключить к MAX

1. **Вебхук:** `scripts/max-webhook.sh subscribe`, проверка — `scripts/max-webhook.sh list`.
   После подписки long polling с этим токеном перестаёт работать (одна среда на один токен).
2. **URL мини-приложения:** business.max.ru → «Чат-боты» → бот → ⋮ → «Настройки» → `https://<DOMAIN>`.

Проверка после запуска: `node scripts/smoke.mjs https://<DOMAIN> --no-auth`.

## Выкатить новую версию

С любой машины, где есть SSH-доступ к серверу:

```bash
DEPLOY_HOST=deploy@<ip> scripts/deploy.sh             # main
DEPLOY_HOST=deploy@<ip> scripts/deploy.sh andrey/x    # другая ветка — только для проверки
DEPLOY_HOST=deploy@<ip> scripts/deploy.sh 4672af1     # конкретный коммит — откат
DEPLOY_MODE=proxy DEPLOY_HOST=deploy@<ip> scripts/deploy.sh   # за чужим прокси
```

После выкатки — `node scripts/smoke.mjs https://<DOMAIN> --no-auth`.

Скрипт переключает код на `origin/<ветка>` (или на указанный коммит), пересобирает образы и перезапускает контейнеры. Миграции применяются
при старте сервера. Данные БД и сертификаты — в томах `db-data` и `caddy-data`, между выкатками не теряются.

## Прод на VK Cloud: образы собираем локально

С ВМ в VK Cloud зарубежные хосты (Docker Hub, npm) открываются нестабильно, поэтому `scripts/deploy.sh --build` там не
подходит. Порядок, которым выкатывали финальную версию:

```bash
# на своей машине, из актуального main
docker compose build meb-server meb-miniapp
docker save max-effective-business-meb-server:latest max-effective-business-meb-miniapp:latest | gzip -1 > images.tar.gz
# залить на сервер (при нестабильной связи — частями через split и cat, сверить sha256sum)

# на сервере
cd /opt/max-effective-business
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > ~/backups/meb-$(date +%Y%m%d-%H%M).sql.gz
docker tag max-effective-business-meb-server:latest max-effective-business-meb-server:rollback-<hash>   # и miniapp
docker load -i images.tar.gz
git fetch origin main && git merge --ff-only origin/main
docker compose -f compose.yaml -f compose.prod.yaml -f compose.local.yaml up -d --no-build
```

`compose.local.yaml` (не в git) подключает сертификат, выпущенный через DNS-01: автовыпуск Let's Encrypt до этой ВМ
не доходит. Откат — вернуть тег `:rollback-<hash>` на `:latest` и снова `up -d --no-build`.

Резервная копия базы — раз в сутки по cron в `~/backups`, хранится 7 дней (`/etc/cron.d/meb-backup`). Копия на той же
ВМ спасает от ошибки в данных, но не от потери ВМ: для пилота — выгрузка в объектное хранилище.

## Если что-то сломалось

```bash
O=compose.prod.yaml     # свой Caddy; за чужим прокси — O=compose.proxy.yaml
docker compose -f compose.yaml -f $O ps
docker compose -f compose.yaml -f $O logs --tail 100 meb-server
docker compose -f compose.yaml -f $O logs --tail 100 caddy     # только со своим Caddy: проблемы с сертификатом
docker network inspect meb-edge --format '{{range .Containers}}{{.Name}} {{end}}'   # за прокси в Docker: кто в общей сети
```

- Откат: `scripts/deploy.sh <хеш коммита>` (с `DEPLOY_MODE=proxy`, если сервер за чужим прокси); схема БД при этом не
  откатывается, миграции только добавляют.
- За прокси в Docker 502 на нашем поддомене — проверить, что контейнер прокси в сети `meb-edge` (команда выше).
- Сертификат не выпускается — проверить A-запись домена и что порт 80 открыт: Let's Encrypt проверяет по HTTP.
