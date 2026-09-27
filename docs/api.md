# Контракт API сервера

Внутренний API мини-приложения (публичный API не заявляем, см. `decisions.md`). Владелец — Андрей,
потребитель — Илья. **После согласования меняется только через PR**, в котором Илья стоит ревьюером.

Статус: черновик от 27.09, ждёт согласования с Ильёй (экраны) и Тимуром (формат `match`). Все эндпоинты реализованы
и покрыты сквозным тестом `apps/server/test/scenario.int.test.ts`.
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
  | `VALIDATION_ERROR` | 400 | неверное тело или параметры; `fields` — ошибки по полям (путь через точку) |
  | `UNAUTHORIZED` | 401 | нет `X-Max-Init-Data`, подпись не сошлась, данные устарели |
  | `FORBIDDEN` | 403 | нет прав (чужая стажировка, нет профиля нужной роли, нет согласия) |
  | `NOT_FOUND` | 404 | нет такого объекта или адреса |
  | `CONFLICT` | 409 | недопустимый переход статуса отклика |
  | `RATE_LIMITED` | 429 | больше `RATE_LIMIT_PER_MIN` запросов в минуту с одного IP |
  | `INTERNAL` | 500 | ошибка сервера; текст безопасно показывать пользователю |

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
| ✅ | GET · PUT | `/api/student/profile` | анкета студента |
| ✅ | GET | `/api/student/feed` | подходящие стажировки, ещё без отклика, с `match` |
| ✅ | GET | `/api/student/interests` | мои отклики со статусами |
| ✅ | GET · PUT | `/api/employer/profile` | профиль компании |
| ✅ | POST | `/api/internships` | создать стажировку → событие `internship.created` |
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

Сервер проверяет `hash` по документации MAX (`authDate`, `phone` без `+` и `userId` из `initData`, подпись токеном
бота) и сохраняет номер, только если подпись сошлась, иначе 400. Ответ — как `GET /api/me`.
Если пользователь отказался (`client.request_phone.user_refused_provide_phone_number`), клиент просто не вызывает метод.

Вне MAX подписанный номер для разработки: `NODE_ENV=development npm run dev:contact -- 100001 +79990000000`.

### `GET /api/skills`

```json
{ "groups": [ { "name": "Аналитика", "skills": [ { "code": "excel", "name": "Excel" }, { "code": "sql", "name": "SQL" } ] } ] }
```

### Анкета студента `GET · PUT /api/student/profile`

Требует согласия на обработку ПД (иначе 403). `GET` без анкеты — 404.

```json
{
  "university": "РАНХиГС",
  "faculty": "ИЭМИТ",
  "course": 3,
  "direction": "Бизнес-информатика",
  "city": "Москва",
  "formats": ["office", "hybrid"],
  "skills": ["excel", "sql", "power_bi"],
  "isDemo": false
}
```

Проверки: `university`, `direction`, `city` — непустые до 200 символов; `faculty` — необязательное; `course` — 1…6;
`formats` — непустой набор; `skills` — коды из справочника, до 30 штук.

### Совпадение `match`

Считает модуль `matching` (Тимур). Везде, где стажировка показывается студенту или кандидат работодателю:

```json
{ "score": 78, "mustMatched": ["excel"], "mustMissing": ["sql"], "niceMatched": ["power_bi"], "niceMissing": [] }
```

Коды навыков; названия клиент берёт из `/api/skills`.

### Стажировка

```json
{
  "id": 7,
  "title": "Стажёр-аналитик",
  "description": "…",
  "company": { "name": "ООО «Вектор»", "city": "Москва" },
  "requiredSkills": ["excel", "sql"],
  "niceSkills": ["power_bi"],
  "format": "hybrid",
  "city": "Москва",
  "startsOn": "2026-10-15",
  "endsOn": "2026-12-15",
  "slots": 2,
  "status": "open",
  "source": "employer",
  "sourceUrl": null,
  "isDemo": false,
  "createdAt": "2026-09-27T10:00:00.000Z",
  "match": { "score": 78, "mustMatched": ["excel"], "mustMissing": ["sql"], "niceMatched": ["power_bi"], "niceMissing": [] },
  "myInterest": null
}
```

`match` и `myInterest` (`null` или статус отклика) — только если у пользователя есть анкета студента. `isOwner` —
стажировка принадлежит текущему пользователю. В `GET /api/employer/internships` у каждой ещё
`counts: { interested, invited, declined }`. `source`: `employer` | `demo` | `trudvsem` | `career_center`.

`POST /api/internships` принимает поля `title`, `description`, `requiredSkills` (хотя бы один), `niceSkills`,
`format`, `city` (обязателен, кроме `remote`), `startsOn`, `endsOn`, `slots`. Требует профиль компании (иначе 403).
`PATCH` — те же поля частично плюс `status: "closed"`. Чужая стажировка — 404.

### Лента `GET /api/student/feed`

Открытые стажировки, прошедшие жёсткие фильтры (формат; город для очных и гибридных), с совпадением больше 0 %,
без отклика этого студента, по убыванию `match.score`, не больше 50. `{ "items": [Стажировка, …] }`. Без анкеты — 403.

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
{ "items": [ { "status": "invited", "match": {…}, "updatedAt": "…", "internship": Стажировка, "employerContact": { "name": "Ольга", "phone": "+7…" } } ] }
```

`employerContact` — только в статусе `invited`, иначе `null`. `phone` работодателя — `null`, если он им не поделился.

### Кандидаты `GET /api/internships/:id/candidates`

Только для владельца стажировки (чужая — 404). Студенты в статусах `interested`, `invited`, `declined`, по убыванию
`match.score`:

```json
{
  "items": [
    {
      "studentId": 12,
      "firstName": "Анна",
      "university": "РАНХиГС", "course": 3, "direction": "Бизнес-информатика", "city": "Москва",
      "status": "interested",
      "match": { "score": 78, "mustMatched": ["excel"], "mustMissing": ["sql"], "niceMatched": [], "niceMissing": [] },
      "phone": null,
      "isDemo": true
    }
  ]
}
```

**`phone` заполнен только в статусе `invited`**, в остальных — `null`. Фамилия не отдаётся до приглашения.

### Приглашение и отказ

`POST …/candidates/:studentId/invite` и `…/decline`, без тела. Ответ — кандидат в формате списка.
Допустимо только из `interested`; повтор того же действия — 200 без повторного события; `invited ↔ declined` — 409.
После `invite` публикуется `interest.invited`: бот пишет обоим контакты и чек-лист.

## Внутренние события (для модуля `bot`)

Публикуются после успешной записи в БД, в событии только идентификаторы. Типы — `apps/server/src/events.ts`.

| Событие | Когда | Данные |
|---|---|---|
| `internship.created` | работодатель опубликовал стажировку | `{ internshipId }` |
| `interest.created` | студент нажал «Интересно» или «Пропустить» (первый раз или смена статуса) | `{ interestId, internshipId, studentUserId, status }` |
| `interest.invited` | работодатель пригласил студента | `{ interestId, internshipId, studentUserId }` |

Ошибка в обработчике события логируется и не влияет на ответ пользователю.
