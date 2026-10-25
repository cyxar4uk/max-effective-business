# Контракт API сервера

Внутренний API мини-приложения (публичный API не заявляем, см. `decisions.md`). Владелец — Андрей,
потребитель — Илья. **После согласования меняется только через PR**, в котором Илья стоит ревьюером.

Статус на 28.09: все эндпоинты реализованы; сквозной тест `apps/server/test/scenario.int.test.ts` проходит каждый,
кроме `/api/health` — он в `src/app.test.ts`.
Колонка «Готово» — что уже реализовано в `apps/server`.

## Общее

- Базовый путь: `/api`. Формат — JSON, UTF-8.
- **Авторизация:** каждый запрос, кроме `GET /api/health`, несёт заголовок `X-Max-Init-Data` со строкой
  `window.WebApp.initData` **как есть** (не `initDataUnsafe`). Сервер проверяет подпись и свежесть (`auth_date`
  не старше `INIT_DATA_MAX_AGE_SEC`, по умолчанию сутки). Пользователь MAX при первом запросе создаётся сам.
- **Ошибка** — всегда в одном формате, HTTP-статус соответствует коду:

  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Проверьте заполнение полей", "fields": { "title": "Обязательное поле" } } }
  ```

  | `code` | HTTP | Когда |
  |---|---|---|
  | `VALIDATION_ERROR` | 400 | неверное тело или параметры, тело — не JSON; `fields` — ошибки по полям (путь через точку); ошибка параметра адреса (`:id`) — под ключом `_` |
  | `VALIDATION_ERROR` | 413 | тело больше 100 КБ |
  | `VALIDATION_ERROR` | 400, 415 | прочие ошибки разбора запроса: неизвестная кодировка тела, битое кодирование в адресе |
  | `UNAUTHORIZED` | 401 | нет `X-Max-Init-Data`, подпись не сошлась, данные устарели |
  | `FORBIDDEN` | 403 | нет прав (чужая стажировка, нет профиля нужной роли, нет согласия) |
  | `NOT_FOUND` | 404 | нет такого объекта или адреса |
  | `CONFLICT` | 409 | недопустимый переход статуса отклика; у работодателя уже 20 открытых мест |
  | `RATE_LIMITED` | 429 | больше `RATE_LIMIT_PER_MIN` запросов в минуту с одного IP |
  | `INTERNAL` | 500 | ошибка сервера; текст безопасно показывать пользователю |
  | `INTERNAL` | 503 | БД временно недоступна — повторить позже |

  `message` написан для пользователя, его можно выводить в интерфейсе как есть.
- Даты — ISO 8601 (`2026-09-27T10:00:00.000Z`), даты без времени — `YYYY-MM-DD`.
- Идентификаторы — числа. Навыки — строковые коды из справочника (`excel`, `sql`).
- Формат работы: `office` | `remote` | `hybrid`.

## Режим разработки вне MAX

Подписанный `initData` для обычного браузера и curl:

```bash
cd apps/server
NODE_ENV=development npm run dev:init-data                           # студент, max id 100001
NODE_ENV=development npm run dev:init-data -- 100002 Работодатель     # другой пользователь
NODE_ENV=development npm run dev:init-data -- 100001 Студент internship_5   # со start_param
```

Нужен тот же `MAX_BOT_TOKEN`, что у сервера (из `.env`). Строку подставлять в `X-Max-Init-Data`.
Действует `INIT_DATA_MAX_AGE_SEC` (сутки), потом сгенерировать заново.

## Эндпоинты

| Готово | Метод | Путь | Что делает |
|---|---|---|---|
| ✅ | GET | `/api/health` | живость сервера и БД, без авторизации |
| ✅ | GET | `/api/me` | текущий пользователь, роли, согласие |
| ✅ | POST | `/api/me/consent` | сохранить согласие на обработку ПД |
| ✅ | POST | `/api/me/phone` | сохранить телефон из `requestContact` |
| ✅ | GET | `/api/skills` | справочник навыков по группам |
| ✅ | GET | `/api/tags` | справочник тегов задач («Сайт», «Маркетплейсы», «1С»…) |
| ✅ | GET · PUT | `/api/student/profile` | анкета студента |
| ✅ | GET | `/api/student/feed` | подходящие места, ещё без отклика, с `match`; `?tags=` — фильтр по тегам |
| ✅ | GET | `/api/student/interests` | мои отклики со статусами |
| ✅ | GET · PUT | `/api/employer/profile` | профиль компании |
| ✅ | POST | `/api/internships` | создать стажировку → событие `internship.created` |
| ✅ | POST | `/api/internships/draft` | черновик карточки места из текста работодателя (GigaChat или ключевые слова) |
| ✅ | GET | `/api/employer/internships` | мои стажировки со счётчиками откликов |
| ✅ | GET | `/api/internships/:id` | стажировка; студенту — с `match` |
| ✅ | PATCH | `/api/internships/:id` | изменить или закрыть свою стажировку |
| ✅ | POST | `/api/internships/:id/interest` | `interested` или `skipped` → событие `interest.created` |
| ✅ | GET | `/api/internships/:id/candidates` | заинтересованные студенты своей стажировки по убыванию совпадения |
| ✅ | POST | `/api/internships/:id/candidates/:studentId/invite` | пригласить → событие `interest.invited` |
| ✅ | POST | `/api/internships/:id/candidates/:studentId/decline` | отказать |

### `GET /api/health`

`200 { "status": "ok", "db": "ok" }` или `503 { "status": "degraded", "db": "unavailable" }`.

### `GET /api/me`

```json
{
  "id": 1,
  "firstName": "Анна",
  "lastName": "Смирнова",
  "hasPhone": false,
  "consent": { "at": "2026-09-27T10:00:00.000Z", "version": "2026-09-27" },
  "roles": { "student": true, "employer": false }
}
```

`consent` — `null`, пока согласия нет. `roles.student` — есть анкета студента, `roles.employer` — есть профиль компании.
Сам телефон в `/api/me` не отдаётся, только признак `hasPhone`.

### `POST /api/me/consent`

Тело: `{ "version": "2026-09-27" }` — версия текста согласия, который видел пользователь. Сервер принимает только
текущую версию, иначе 400 (обновить текст на клиенте). Ответ — как `GET /api/me`. Повторный вызов обновляет дату.

### `POST /api/me/phone`

Требует согласия. Тело — ровно то, что вернул `await window.WebApp.requestContact()`:

```json
{ "phone": "+79990000000", "authDate": "1790500000", "hash": "…64 hex…" }
```

`authDate` — цифры; подпись номера действует столько же, сколько данные запуска (`INIT_DATA_MAX_AGE_SEC`, сутки),
старше — 400 «Подтверждение номера устарело». Сервер проверяет `hash` по документации MAX (`authDate`, `phone` без `+` и `userId` из `initData`, подпись токеном
бота) и сохраняет номер, только если подпись сошлась, иначе 400. Ответ — как `GET /api/me`.
Если пользователь отказался (`client.request_phone.user_refused_provide_phone_number`), клиент просто не вызывает метод.

Вне MAX подписанный номер для разработки: `NODE_ENV=development npm run dev:contact -- 100001 +79990000000`.

### `GET /api/skills`

```json
{ "groups": [ { "name": "Аналитика и данные", "skills": [ { "code": "excel", "name": "Excel" }, { "code": "sql", "name": "SQL" } ] } ] }
```

Группы и навыки внутри групп — в порядке, заданном в справочнике (поле `sort`), а не по алфавиту.

### `GET /api/tags`

Теги задач: чем студент займётся на месте. Тег подставляет навыки в форму работодателя (он их правит) и фильтрует
ленту студента. В расчёте совпадения теги не участвуют. Справочник грузится при старте сервера, как навыки;
навыки тегов — коды из `/api/skills`.

```json
{ "items": [ { "code": "marketplaces", "name": "Маркетплейсы", "skills": ["marketplace_cards", "wildberries", "ozon", "product_photo", "unit_economics"] } ] }
```

### Анкета студента `GET · PUT /api/student/profile`

`PUT` требует согласия на обработку ПД (иначе 403). `GET` без анкеты — 404.

```json
{
  "university": "РАНХиГС",
  "faculty": "ИЭМИТ",
  "course": 3,
  "direction": "Бизнес-информатика",
  "city": "Москва",
  "formats": ["office", "hybrid"],
  "skills": ["excel", "sql", "power_bi"],
  "practiceMonth": "2026-11",
  "isDemo": false
}
```

Проверки (decisions.md, 27.09): `university`, `direction`, `city` — непустые до 200 символов; `faculty` — необязательное;
`course` — 1…6; `formats` — непустой набор; `skills` — коды из справочника, **от 3** до 30 штук;
`practiceMonth` — необязательное, `ГГГГ-ММ` (месяц практики; на карточке показываем, но ленту по нему не фильтруем);
пустая строка или `null` — не указан.

### Профиль компании `GET · PUT /api/employer/profile`

`PUT` требует согласия на обработку ПД (иначе 403). `GET` без профиля — 404.

```json
{ "companyName": "ООО «Вектор»", "city": "Москва", "contactName": "Ольга", "isDemo": false }
```

Все три поля обязательные и непустые: `companyName` и `contactName` — до 200 символов, `city` — до 100.
`contactName` студент видит в `employerContact.name` после приглашения.

Реквизиты для документов практики (F-16) — необязательные, в ответе `null`, если не заполнены:
`legalName`, `inn`, `ogrn`, `legalAddress`, `signerName`, `signerPosition`, `signerBasis`, `responsibleName`,
`responsiblePosition`, `responsiblePhone`, `responsibleEmail`. ИНН — 10 или 12 цифр, ОГРН — 13 или 15, почта —
`name@example.ru`, остальное — до 300 символов; ошибка — `400` с `fields` по имени поля. Поле, которого нет в `PUT`,
не меняется; `""` или `null` — стирает.

### Документы для практики `GET /api/interests/:id/documents`

`:id` — `interestId` из кандидатов или откликов. Только две стороны приглашения (студент и владелец места), только
статус `invited` и место с типом `practice`, иначе `404`.

```json
{
  "role": "employer",
  "internship": { "id": 12, "title": "Оформить карточки чая на Wildberries", "company": "Чайная лавка «Сафина»" },
  "requisitesReady": true,
  "items": [
    { "kind": "contract", "fileName": "Договор о практической подготовке.docx", "url": "https://…/api/practice-files/…" },
    { "kind": "consent_letter", "fileName": "…", "url": "…" },
    { "kind": "task", "fileName": "…", "url": "…" },
    { "kind": "review", "fileName": "…", "url": "…" }
  ]
}
```

- `requisitesReady` — заполнены все реквизиты, кроме телефона и почты ответственного. Иначе у `contract` и
  `consent_letter` `url: null`.
- `url` — подписанная ссылка на 15 минут для `WebApp.downloadFile`: MAX качает файл сам, без `X-Max-Init-Data`.
  Подпись покрывает отклик, вид документа и пользователя; доступ проверяется заново при скачивании. Просрочена или
  подделана — `404`. Без `MINIAPP_URL` ссылок нет (`null`).

### Документ `GET /api/interests/:id/documents/:kind`

`kind` — `contract` | `consent_letter` | `task` | `review`. Ответ — `.docx` с `Content-Disposition: attachment`.
Доступ — как у списка. Договор и письмо без реквизитов — `409` с текстом, что заполнить. Шаблоны и подстановка —
`docs/features/F-16-practice-docs.md`, сборка — `apps/server/src/docs/templates.ts`. В лог — только id отклика и вид.

### Совпадение `match`

Считает модуль `matching` (Тимур). Везде, где стажировка показывается студенту или кандидат работодателю:

```json
{
  "score": 65,
  "mustMatched": ["excel"],
  "mustMissing": ["sql"],
  "niceMatched": ["power_bi"],
  "niceMissing": [],
  "mustClose": [],
  "niceClose": []
}
```

Коды навыков; названия клиент берёт из `/api/skills`.

`mustClose` / `niceClose` (#71) — требования, закрытые близким навыком наполовину: `{ "need": "wildberries", "have":
"ozon" }` — место хочет Wildberries, у студента есть Ozon. Такое требование остаётся и в `mustMissing` /
`niceMissing`: навыка у студента нет. Пары близких навыков — `apps/server/src/seed/closeSkills.ts`. В откликах,
сохранённых до #71 (`interests.match`), этих полей нет — читать как пустые.

### Место (стажировка, практика, подработка)

В интерфейсе — «место», в API исторически `internships`.

```json
{
  "id": 7,
  "type": "practice",
  "title": "Стажёр-аналитик",
  "description": "…",
  "company": { "name": "ООО «Вектор»", "city": "Москва" },
  "requiredSkills": ["excel", "sql"],
  "niceSkills": ["power_bi"],
  "tags": ["spreadsheets"],
  "format": "hybrid",
  "city": "Москва",
  "startsOn": "2026-10-15",
  "endsOn": "2026-12-15",
  "paid": true,
  "salary": 30000,
  "slots": 2,
  "status": "open",
  "source": "employer",
  "sourceUrl": null,
  "isDemo": false,
  "createdAt": "2026-09-27T10:00:00.000Z",
  "match": { "score": 65, "mustMatched": ["excel"], "mustMissing": ["sql"], "niceMatched": ["power_bi"], "niceMissing": [], "mustClose": [], "niceClose": [] },
  "myInterest": null
}
```

`match` и `myInterest` (`null` или статус отклика) — только если у пользователя есть анкета студента. `isOwner` —
стажировка принадлежит текущему пользователю. В `GET /api/employer/internships` у каждой ещё
`counts: { interested, invited, declined }`. `source`: `employer` | `demo` | `trudvsem` | `career_center`.

- `type`: `practice` (практика) | `internship` (стажировка) | `part_time` (подработка).
- `title` — задача: что сделать на месте, коротко («Настроить карточки на Wildberries»).
- `paid`: `true` / `false`; `null` — не указано. `null` бывает у мест из импорта и демо, а также у мест, созданных до
  появления этого поля (28.09): карточка и форма редактирования должны это выдерживать. `salary` — ₽ в месяц,
  по желанию, только при `paid: true`, иначе `null`.
- `tags` — 0–3 кода из `/api/tags`.
- `startsOn`, `endsOn` — показываем на карточке; ленту по срокам в MVP не фильтруем. У старых, демо- и
  импортированных мест могут быть `null`.
- `id` — число, как и везде.

Какие ключи добавляются к месту в разных ответах:

| Ответ | Дополнительно |
|---|---|
| `POST`, `PATCH /api/internships`, `GET /api/employer/internships` | `isOwner: true`; в списке — ещё `counts` |
| `GET /api/internships/:id` | `isOwner`; при анкете студента — `match`, `myInterest` |
| `GET /api/student/feed` | `match`, `myInterest: null` |
| `GET /api/student/interests` | место без дополнительных ключей — внутри `internship` |

`POST /api/internships` — публикация, ответ `201` с местом. Требует профиль компании (иначе 403). **Обязательные поля** (decisions.md,
27.09): `type`, `title`, `requiredSkills` (хотя бы один), `format`, `city` (кроме `remote`), `startsOn`, `endsOn`,
`paid`, `slots` (1…100). По желанию — `description`, `niceSkills`, `tags`, `salary`: их можно не передавать или
передать `null`.

Лимиты: `title` — до 200 символов, `description` — до 4000, `city` — до 100; навыков в каждом списке — до 20;
тегов — до 3 (дубли не считаются); `salary` — целое, 1…10 000 000.

Проверки идут по очереди, и за один ответ приходят ошибки только одного этапа: сначала поля по отдельности (типы,
обязательность, лимиты), затем правила между полями (город для `office`/`hybrid`; `endsOn` не раньше `startsOn`;
навык не может быть одновременно обязательным и желательным; `salary` только при `paid: true`), затем справочники
(навыки и теги). Поэтому правила между полями лучше проверять и в форме.

**Не больше 20 открытых мест у работодателя:** 21-е (и переоткрытие закрытого сверх лимита) — `409`.

`PATCH /api/internships/:id` — те же поля частично плюс `status: "open" | "closed"`. При `paid: false` сумма
сбрасывается в `null`, даже если форма прислала её вместе с `paid`. Ошибка по датам приходит в том поле, которое
меняли. Чужое место — 404.

### Черновик места `POST /api/internships/draft`

Работодатель пишет задачу своими словами — сервер предлагает черновик карточки: заголовок, тег, обязательные и
желательные навыки, тип и формат. Работодатель проверяет и правит его в форме, место по-прежнему публикует
`POST /api/internships`. Это помощь при заполнении, а не подбор: процент совпадения считает формула.

Требует профиль компании (иначе 403). Тело:

```json
{ "text": "Нужен человек вести инсту кофейни и снимать сторис" }
```

`text` — 10…1000 символов. Ответ `200`:

```json
{
  "source": "ai",
  "title": "Вести соцсети кофейни и снимать сторис",
  "tags": ["social_ads"],
  "requiredSkills": ["smm", "video_editing"],
  "niceSkills": ["copywriting", "canva"],
  "type": null,
  "format": "office"
}
```

- `source`: `ai` — черновик от GigaChat; `rules` — по ключевым словам (ключ не задан, модель недоступна, не
  ответила за 12 с или ответила не по формату). При `rules` мини-приложение не называет черновик «ИИ».
- Коды навыков и тегов — только из `/api/skills` и `/api/tags`: неизвестные сервер выкидывает. `tags` — 0–1 код;
  `requiredSkills` — 0–5, `niceSkills` — 0–6, без пересечения. Пустой `requiredSkills` бывает только у `rules`,
  если в тексте не нашлось ни одного знакомого слова.
- `type`, `format` — `null`, если из текста не понять: форма такое поле не трогает. Ответ модели здесь сервер
  оставляет, только если текст вообще говорит о типе места или формате («подработка», «практика», «удалённо»,
  «в офисе»…), иначе `null`: модель любит угадывать «на месте».
- Лимит — `AI_DRAFT_PER_HOUR` (10) черновиков в час на пользователя, сверх — `429 RATE_LIMITED`; действует, только
  когда задан ключ GigaChat. Запросы с ошибкой в теле и без профиля компании лимит не расходуют. Защита ключа на весь
  сервер: к модели не больше 4 запросов одновременно (у физлица, `GIGACHAT_API_PERS`, — 1: GigaChat даёт ему один
  поток), остальные ждут в очереди до 4 запросов в пределах срока ответа; не больше 300 запросов в час; после сетевой
  ошибки, 5xx или молчания модели весь срок — минута без модели. Очередь полна, не дождались или пауза — ответ `200`
  с `source: "rules"`.
- При старте сервер берёт токен и список моделей и пишет в лог «GigaChat: ключ принят, модель доступна» или
  предупреждение: так мёртвый ключ или опечатку в `GIGACHAT_MODEL` видно сразу после выкатки.
- Текст работодателя уходит в GigaChat (Сбер, серверы в России) и в логи сервера не пишется.

### Лента `GET /api/student/feed`

Открытые места, прошедшие жёсткие фильтры (формат; город для очных и гибридных), с совпадением больше 0 % и не ниже
`FEED_MIN_SCORE` (по умолчанию 40 %), без отклика этого студента, по убыванию `match.score`, не больше 50. `{ "items": [Место, …] }`. Без анкеты — 403.

`?tags=website,one_c` (или `?tags=website&tags=one_c`) — только места, у которых есть хотя бы один из этих тегов.
Неизвестный тег — пустая лента.

### Отклик `POST /api/internships/:id/interest`

Тело: `{ "action": "interested" | "skipped" }`. Ответ: `{ "status": "interested", "match": {…} }`.

Статусы отклика — конечный автомат:

```
(нет) ──> skipped ──> interested ──> invited
   └────> interested ─────────────> declined
```

- Повтор того же действия идемпотентен: 200 с текущим статусом, событие второй раз не публикуется.
- `skipped → interested` разрешено (передумал). `interested → skipped` разрешено до решения работодателя.
- После `invited` или `declined` студент статус не меняет → 409.
- На закрытую стажировку новое «Интересно» → 409.
- `match` сохраняется на момент отклика; его же видит работодатель в списке кандидатов.

### Мои отклики `GET /api/student/interests`

Отклики, кроме `skipped`, новые сверху:

```json
{ "items": [ { "status": "invited", "match": {…}, "updatedAt": "…", "interestId": 34, "internship": Место, "employerContact": { "name": "Ольга", "phone": "+7…" } } ] }
```

`employerContact` — только в статусе `invited`, иначе `null`. `phone` работодателя — `null`, если он им не поделился.
`interestId` — id отклика: по нему открываются документы для практики (F-16).

### Кандидаты `GET /api/internships/:id/candidates`

Только для владельца стажировки (чужая — 404). Студенты в статусах `interested`, `invited`, `declined`, по убыванию
`match.score`:

```json
{
  "items": [
    {
      "interestId": 34,
      "studentId": 12,
      "firstName": "Анна",
      "lastName": null,
      "university": "РАНХиГС", "course": 3, "direction": "Бизнес-информатика", "city": "Москва",
      "status": "interested",
      "match": { "score": 50, "mustMatched": ["excel"], "mustMissing": ["sql"], "niceMatched": [], "niceMissing": [] },
      "phone": null,
      "interestedAt": "2026-09-29T08:15:00.000Z",
      "isDemo": true
    }
  ]
}
```

**`lastName` и `phone` заполнены только в статусе `invited`**, в остальных — `null`. `interestId` — id отклика (F-16).

`interestedAt` — когда студент впервые нажал «Интересно»; повторные «Пропустить» → «Интересно» его не сдвигают.
Метрика «от публикации до первого отклика» — самый ранний `interestedAt` минус `createdAt` места. У откликов из
демо-данных и созданных до 29.09 — время создания отклика.

### Приглашение и отказ

`POST …/candidates/:studentId/invite` и `…/decline`, без тела. Ответ — кандидат в формате списка.
Допустимо только из `interested`; повтор того же действия — 200 без повторного события; `invited ↔ declined` — 409.
Студент не откликался или нажал «Пропустить» — 404.
После `invite` публикуется `interest.invited`: бот пишет студенту контакт работодателя и чек-лист следующих шагов,
работодателю — имя и телефон студента.

## Внутренние события

Публикуются после успешной записи в БД, в событии только идентификаторы (числа). Типы — `apps/server/src/events.ts`.

| Событие | Когда | Данные | Кто слушает |
|---|---|---|---|
| `internship.created` | работодатель опубликовал место | `{ internshipId }` | `bot` — уведомления студентам; при `SEED_DEMO=true` ещё `seed/demo/responder` — демо-отклики |
| `interest.created` | студент нажал «Интересно» или «Пропустить» (первый раз или смена статуса) | `{ interestId, internshipId, studentUserId, status }` | `bot` — уведомление работодателю; при `SEED_DEMO=true` ещё `seed/demo/responder` — приглашение от демо-компании |
| `interest.invited` | работодатель пригласил студента (или демо-компания — сама) | `{ interestId, internshipId, studentUserId }` | `bot` — контакты обоим |
| `demo.responses` | только `SEED_DEMO=true`: на место проверяющего откликнулись тестовые студенты | `{ internshipId, count }` | `bot` — одно сообщение владельцу места |

Ошибка в обработчике события логируется и не влияет на ответ пользователю. Демо-отклики `interest.created` не публикуют:
вместо уведомления на каждый отклик работодатель-проверяющий получает одно сообщение по `demo.responses`.
Приглашение от демо-компании (через 20 с, совпадение от 70 %, не чаще одного на студента за `DEMO_INVITE_COOLDOWN_HOURS` часов, по умолчанию 24) публикует обычный
`interest.invited`; в сообщении бота первая строка — «Тестовое приглашение».
