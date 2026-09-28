# Живая проверка в MAX (задачи #20 и #23)

Порядок на день деплоя. Нужно: доступ к серверу Ильи (#13), поддомен, токен и ник бота от Артёма.

## 1. Деплой (#20), ~15 минут

По [docs/deploy.md](../../docs/deploy.md), раздел «Если на сервере уже есть nginx или Caddy».

```bash
# на сервере, один раз
docker network create meb-edge
git clone https://github.com/cyxar4uk/max-effective-business.git /opt/max-effective-business
cd /opt/max-effective-business && cp .env.example .env && chmod 600 .env
#   MAX_BOT_TOKEN, POSTGRES_PASSWORD (openssl rand -hex 24), MAX_WEBHOOK_SECRET (openssl rand -hex 32),
#   DOMAIN=<поддомен>, SEED_DEMO=true
docker compose -f compose.yaml -f compose.proxy.yaml up -d --build
```

Прокси Ильи: блок из `deploy/nginx.conf.example` (nginx на хосте), `deploy/nginx-docker.conf.example` (nginx в Docker,
плюс `docker network connect meb-edge <контейнер>`) или `deploy/Caddyfile.snippet`.

```bash
node scripts/smoke.mjs https://<поддомен> --no-auth     # health и 401 без подписи
scripts/max-webhook.sh subscribe && scripts/max-webhook.sh list
```

business.max.ru → «Чат-боты» → бот → ⋮ → «Настройки» → URL мини-приложения `https://<поддомен>`.

Готово, когда: `/api/health` отвечает по HTTPS, бот отвечает на `/start`.

## 2. Проверка на телефоне (#23)

В одном окне — логи сервера:

```bash
docker compose -f compose.yaml -f compose.proxy.yaml logs -f server | grep --line-buffered -E 'initData|contactScheme|Уведомлен|webhook|"level":(40|50)'
```

| Шаг | Что смотреть | Что записать в `docs/05_max_platform.md` |
|---|---|---|
| «Начать» у бота | приходит приветствие с кнопками; в логе нет ошибок вебхука | вебхук работает, формат `bot_started` совпал |
| «Я студент» (`open_app`) | мини-приложение открылось с ролью студента | `payload` кнопки приходит в `start_param` |
| любой запрос мини-приложения | нет `initData отклонён`; если есть — код причины (`BAD_SIGNATURE`, `EXPIRED` + `initDataAgeSec`) | подпись `initData` сходится на живых данных |
| имя с пробелом (например, «Анна Мария») | есть ли строка `initDataEncoding: "plus"` | как MAX кодирует пробелы: `%20` или `+` |
| «Поделиться номером» | `Номер подтверждён` и `contactScheme` | какая формула `requestContact` сработала: `key=token`, `key=data` или `webappdata` — оставить её одну в `auth/contact.ts` |
| анкета → лента → «Интересно» | работодателю приходит «новый кандидат» | уведомления доходят |
| второй аккаунт (или переключение роли): место → кандидаты → «Пригласить» | обоим приходят контакты и чек-лист | `user.id` из `initData` = `user_id` Bot API |
| открыть по диплинку `?startapp=internship_<id>` без «Начать» | приходят ли уведомления | можно ли писать тому, кто не нажимал «Начать» |

Готово, когда: основной сценарий пройден на телефоне от `/start` до приглашения, итоги записаны в
`docs/05_max_platform.md`.

## Если что-то не так

- `BAD_SIGNATURE` на каждом запросе — токен в `.env` не того бота или мини-приложение шлёт не `WebApp.initData`.
- `EXPIRED` с большим `initDataAgeSec` — мини-приложение долго открыто; увеличить `INIT_DATA_MAX_AGE_SEC`.
- `Подпись номера не сошлась` — ни одна из трёх формул `requestContact` не подошла: снять в логе (без номера)
  поля ответа `requestContact` и сверить с dev.max.ru.
- Нет сообщений от бота — `scripts/max-webhook.sh list`; в логе `Уведомление не отправлено` с `reason`.
