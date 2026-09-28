# Платформа MAX: что проверено по документации

Сверено с dev.max.ru 27.09.2026. Документация меняется, поэтому **перед реализацией и перед сдачей сверяйтесь
с первоисточником**. Если нашли расхождение, поправьте этот файл в том же PR.

Методы, которых здесь нет, не выдумываем: сначала находим в документации, потом пишем сюда со ссылкой.

## Мини-приложение

- Подключение Bridge: `<script src="https://st.max.ru/js/max-web-app.js"></script>`, глобальный объект — `window.WebApp`
  ([Bridge](https://dev.max.ru/docs/webapps/bridge)).
- Поля: `initData` (строка для проверки на сервере), `initDataUnsafe` (JSON, **доверять нельзя**), `platform`
  (`ios`, `android`, `desktop`, `web`), `version`.
- Параметр запуска: `window.WebApp.initDataUnsafe.start_param`.
- Методы, которые нам нужны:
  - `requestContact()` — номер телефона в модальном окне. **Как результат доходит и как его проверить — уточнить в документации** (Илья + Андрей);
  - `openCodeReader()` — сканирование QR камерой или из файла;
  - `shareMaxContent(params)` — поделиться внутри MAX;
  - `openMaxLink(url)` и `openLink(url)` — открыть диплинк MAX или внешнюю ссылку;
  - `BackButton` (`show`, `hide`, `onClick`, `offClick`);
  - `HapticFeedback` (`impactOccurred`, `notificationOccurred`, `selectionChanged`);
  - `DeviceStorage` и `SecureStorage`.
- URL мини-приложения задаётся в платформе для партнёров: business.max.ru → «Чат-боты» → бот → ⋮ → «Настройки».
  Только `https://`, до 1024 символов ([подключение](https://dev.max.ru/docs/webapps/introduction)).
- Диплинк: `https://max.ru/<ник_бота>?startapp=<payload>`, payload до 512 символов из `A–Z a–z 0–9 _ -`.
  Невалидный payload отрезается.

## Проверка подписи initData — обязательно на сервере

По [документации](https://dev.max.ru/docs/webapps/validation):

1. Разобрать строку `initData` на пары `key=value` по `&`, URL-декодировать значения.
2. Вынуть и запомнить `hash`, остальные пары отсортировать по ключу a → z.
3. Склеить в строку `key=value` через `\n`.
4. Секретный ключ = HMAC-SHA256 от строки `WebAppData`, где ключ — токен бота.
5. Подпись = HMAC-SHA256 от строки из шага 3 на секретном ключе, в hex.
6. Сравнить с `hash` (сравнение с постоянным временем). Дополнительно проверить свежесть `auth_date`.

Существует пакет `max-validate-init-data`, но он не официальный: либо проверить его код, либо написать своё по шагам выше.

## Bot API

Сверено 27.09.2026 (Тимур) по [обзору API](https://dev.max.ru/docs-api),
[OpenAPI-схеме](https://github.com/max-messenger/api-schema/blob/main/schema.yaml) (версия 0.0.33) и коду
SDK `@maxhub/max-bot-api` 0.3.1 ([client.ts](https://github.com/max-messenger/max-bot-api-client-ts/blob/main/src/core/network/api/client.ts)).

- **Бот хакатона** (выдан организаторами 28.09, проверено `GET /me`): ник **`t373_hakaton_max_bot`**, `user_id` 411890855.
  Этот ник идёт в `web_app` кнопок `open_app` (бот берёт его сам из `GET /me`) и в диплинки
  `https://max.ru/t373_hakaton_max_bot?startapp=…`. Токен — только в `.env`.
- **Сертификат MAX — от удостоверяющего центра Минцифры** (Russian Trusted Root CA → Russian Trusted Sub CA →
  `*.max.ru`). Его нет ни в стандартном наборе Node.js и образе `node:alpine`, ни в системном наборе Windows/Ubuntu:
  без него любой запрос к Bot API падает (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, в curl — «untrusted root»). Сервер
  добавляет этот корень к доверенным при старте (`apps/server/src/tls/russianRootCa.ts`, Node 24.5+), для curl —
  `--cacert deploy/russian_trusted_root_ca.crt`. Проверку сертификатов **не отключаем**. Корень — с Госуслуг
  (`gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt`), SHA-256 `D2:6D:2D:02:…:CA:8E:CF:31`.
- **Базовый адрес: `https://platform-api2.max.ru`.** Старый `platform-api.max.ru` в SDK помечен как устаревший
  (`@deprecated: use botapi v2`), документация требует `platform-api2`.
- **Заголовок: `Authorization: <токен>`** — сам токен, **без** `Bearer` и других префиксов. В query токен больше
  не принимается. Так в схеме (`securitySchemes.access_token`: `in: header`, `name: Authorization`), в примерах
  `curl -H 'Authorization: %access_token%'` и в SDK: `headers = { Authorization: token }`.
- События: либо long polling `GET /updates`, либо вебхук `POST /subscriptions`. Одновременно нельзя: при
  подписке на вебхук polling отключается. Секрет вебхука приходит в заголовке `X-Max-Bot-Api-Secret`
  ([подписки](https://dev.max.ru/docs-api/methods/POST/subscriptions)). Long polling документация называет
  неподходящим для прода. Вебхук — только HTTPS с сертификатом доверенного УЦ, самоподписанные не принимаются
  ([подготовка](https://dev.max.ru/docs/chatbots/bots-coding/prepare)). Недоставленный вебхук (не `200`)
  платформа повторяет с растущей паузой до 8 часов, поэтому **обработчик вебхука должен быть идемпотентным**.
- Отправка: `POST /messages?user_id=<id>` (личный диалог) или `?chat_id=<id>`
  ([messages](https://dev.max.ru/docs-api/methods/POST/messages)). Тело: `text` до 4000 символов, `attachments`,
  `notify` (по умолчанию `true`), `format: "markdown" | "html"`. В SDK: `bot.api.sendMessageToUser(userId, text, extra)`.
- `GET /me` — сведения о боте (`BotInfo`: `user_id`, `username`). Бот берёт отсюда свой ник для поля `web_app`
  кнопки `open_app`, поэтому ник не нужно хранить в настройках.
- Входящее сообщение (`message_created`): `message.sender` — отправитель, `message.recipient.chat_type` — `dialog`,
  `chat` или `channel`, `message.body.mid` — id сообщения. Бот отвечает только в `dialog` и только людям (`is_bot`).
- Кнопки inline-клавиатуры: `callback`, `link`, `open_app`, `message`, `request_contact`, `request_geo_location`,
  `clipboard`. Текст кнопки 1–128 символов.
- Вложения: `image`, `video`, `audio`, `file`, `sticker`, `contact`, `inline_keyboard`, `share`, `location`.
- Лимиты: **не больше 2 сообщений в секунду в один диалог** ([messages](https://dev.max.ru/docs-api/methods/POST/messages));
  **не больше 30 запросов в секунду на `platform-api2.max.ru`** ([подготовка](https://dev.max.ru/docs/chatbots/bots-coding/prepare)).
  Превышение — `429`. SDK сам повторяет long polling при `429` и `5xx`; для отправки сообщений повторы делаем сами.
- Ошибки: JSON `{ code, message }`. `403` на `POST /messages` — пользователь остановил бота, у бота нет доступа к
  чату или пересылка запрещена. Повторять `403` бессмысленно: помечаем уведомление как `failed`.

### Кнопка `open_app` и параметр запуска

Схема `OpenAppButton` ([schema.yaml](https://github.com/max-messenger/api-schema/blob/main/schema.yaml)):

```json
{ "type": "open_app", "text": "Я студент", "web_app": "<ник_бота>", "payload": "student" }
```

- `web_app` (обязательно) — публичное имя (ник) бота, к которому привязано мини-приложение. Для своего
  мини-приложения — ник нашего бота. Альтернатива — `contact_id` (числовой id бота).
- `payload` — строка до 512 символов по шаблону `^[\w-]*$` (латиница, цифры, `_`, `-`). Те же ограничения,
  что у `startapp` в диплинке ([введение](https://dev.max.ru/docs/webapps/introduction)).
- В мини-приложении параметр читается из `window.WebApp.initDataUnsafe.start_param` и входит в подписанную строку
  `initData` ([Bridge](https://dev.max.ru/docs/webapps/bridge)). Документация явно описывает это для диплинка
  `?startapp=`; что `payload` кнопки попадает туда же — следует из схемы, но **проверить руками на живом боте**.
- SDK: `Keyboard.button.openApp(text, webApp, contactId?, payload?)`.
- Для нашего бота: `student`, `employer`, `internship_<id>` — все укладываются в шаблон.

### Диплинк на бота (`?start=`) против диплинка на мини-приложение (`?startapp=`)

- `https://max.ru/<ник_бота>?start=<payload>` открывает **диалог с ботом**, бот получает событие `bot_started`
  с полем `payload` ([схема, раздел Deep linking](https://github.com/max-messenger/api-schema/blob/main/schema.yaml)).
  Ограничение длины в документации противоречиво: в тексте 128 символов, в схеме `BotStartedUpdate.payload` — 512.
  Держимся ≤ 128.
- `https://max.ru/<ник_бота>?startapp=<payload>` открывает **сразу мини-приложение**, бот события не получает.
  Для QR-кода на ярмарке это то, что нужно.

### Как получить `user_id` и можно ли писать после `/start`

- Нажатие «Начать» (или переход по `?start=`) присылает боту `bot_started`: `chat_id` диалога, объект `user`
  с `user_id`, `first_name`, `username`, и необязательный `payload`. SDK: `bot.on('bot_started', ctx => …)`,
  `ctx.startPayload`, `ctx.user`.
- Сообщение пользователя в диалоге приходит как `message_created`, отправитель — `message.sender.user_id`.
- После `bot_started` бот **может писать пользователю сам** через `POST /messages?user_id=…`: это обычный
  личный диалог. Запрет только один — пользователь остановил бота (событие `bot_stopped`, при отправке `403`).
- `user.id` в `initData` мини-приложения и `user_id` в Bot API — один и тот же идентификатор пользователя MAX
  по смыслу, но **документация этого прямо не пишет**. Проверить на живом боте: открыть мини-приложение,
  взять `user.id`, отправить на него сообщение ботом.
- **Не проверено:** получит ли сообщение пользователь, который открыл мини-приложение по `?startapp=`, но ни разу
  не нажал «Начать» в диалоге с ботом. Документация об этом молчит. Поэтому основной путь — через `/start`,
  а в мини-приложении стоит подсказка «Чтобы получать уведомления, запустите бота» со ссылкой `?start=`.
  Ошибку отправки пишем в `notifications`, сценарий не ломаем.

## Официальные библиотеки

- JS/TS SDK для ботов: npm `@maxhub/max-bot-api` ([max-messenger/max-bot-api-client-ts](https://github.com/max-messenger/max-bot-api-client-ts)),
  поддерживает long polling и вебхуки.
- React UI-кит для мини-приложений: [max-messenger/max-ui](https://github.com/max-messenger/max-ui).
- Каталог сообщества: [awesome-max](https://github.com/max36895/awesome-max).

## Модерация и правила

По [статье на Хабре](https://habr.com/ru/articles/951326/); к хакатону применимость уточняет Артём у организаторов:

- **Ник бота** 11–60 символов, начинается со строчной буквы, заканчивается на `bot` или `_bot`. **После создания не меняется.**
- Мини-приложение: HTTPS, подключён Bridge, работают `WebApp.ready()` и `WebApp.BackButton.onClick()`,
  **обязательна проверка `initData`**.
- В мини-приложении видны ссылки на пользовательское соглашение, политику конфиденциальности, реквизиты и контакты поддержки.
- Публиковать ботов могут только верифицированные юрлица РФ. На хакатоне токен выдают организаторы.
