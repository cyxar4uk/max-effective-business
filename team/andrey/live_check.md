# Живая проверка в MAX (задачи #20 и #23)

Порядок на день деплоя. Нужно: доступ к VPS (#13: пользователь `deploy`, IP — от Ильи), A-запись
`tandem.anyway-community.ru` на этот IP, почта для Let's Encrypt, deploy key в репозитории (добавляет Илья —
[docs/deploy.md](../../docs/deploy.md), «Доступ к репозиторию на сервере»), токен бота (у Артёма).

## 1. Деплой (#20), ~20 минут

Отдельный VPS в VK Cloud (2 ГБ, Ubuntu 24.04), чужого прокси нет — свой Caddy из `compose.prod.yaml`
([docs/deploy.md](../../docs/deploy.md), «Первый запуск на сервере»).

```bash
ssh deploy@<IP>
docker compose version                           # v2.24+
getent hosts tandem.anyway-community.ru          # должен быть IP этого сервера, иначе сертификат не выпустится
# 2 ГБ мало для сборки сервера и мини-приложения разом: своп, если `swapon --show` пуст
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# deploy key и клон в /opt/max-effective-business — docs/deploy.md, «Доступ к репозиторию на сервере»
cd /opt/max-effective-business && cp .env.example .env && chmod 600 .env
sed -i -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" \
  -e "s/^MAX_WEBHOOK_SECRET=.*/MAX_WEBHOOK_SECRET=$(openssl rand -hex 32)/" \
  -e "s/^DOMAIN=.*/DOMAIN=tandem.anyway-community.ru/" -e "s/^SEED_DEMO=.*/SEED_DEMO=true/" .env
nano .env                                        # MAX_BOT_TOKEN и ACME_EMAIL — вписать руками
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
scripts/max-webhook.sh subscribe && scripts/max-webhook.sh list
```

С ноутбука:

```bash
node scripts/smoke.mjs https://tandem.anyway-community.ru --no-auth     # health и 401 без подписи
DEPLOY_HOST=deploy@<IP> scripts/deploy.sh                               # следующие выкатки из main
```

business.max.ru → «Чат-боты» → бот → ⋮ → «Настройки» → URL мини-приложения `https://tandem.anyway-community.ru`.

Готово, когда: `/api/health` отвечает по HTTPS, бот отвечает на `/start`.

## 2. Проверка на телефоне (#23)

В одном окне — логи сервера:

```bash
docker compose -f compose.yaml -f compose.prod.yaml logs -f meb-server | grep --line-buffered -E 'initData|contactScheme|Уведомлен|webhook|"level":(40|50)'
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
