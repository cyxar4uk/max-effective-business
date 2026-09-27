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

- Базовый адрес: `https://platform-api.max.ru`. Токен передаётся в заголовке `Authorization`
  (в query больше не поддерживается). Точный формат заголовка сверить в документации.
  В одном стороннем источнике упоминается домен `platform-api2.max.ru`: сверить.
- События: либо long polling `GET /updates`, либо вебхук `POST /subscriptions`. Одновременно нельзя: при
  подписке на вебхук polling отключается. Секрет вебхука приходит в заголовке `X-Max-Bot-Api-Secret`
  ([подписки](https://dev.max.ru/docs-api/methods/POST/subscriptions)).
- Отправка: `POST /messages` с `user_id` (личный диалог) или `chat_id`
  ([messages](https://dev.max.ru/docs-api/methods/POST/messages)). Разметка — `format: "markdown" | "html"`.
- Кнопки inline-клавиатуры: `link`, `callback`, `request_contact`, `open_app`, `message`.
- Вложения: `image`, `video`, `audio`, `file`, `sticker`, `contact`, `inline_keyboard`, `share`, `location`.
- Лимиты: не больше 2 сообщений в секунду в один диалог; общий лимит около 30 запросов в секунду.

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
