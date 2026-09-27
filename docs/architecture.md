# Архитектура

Владелец — Андрей. Схемы для README и презентации. GitHub рисует их сам; для слайда — скриншот этой страницы
или экспорт через [mermaid.live](https://mermaid.live).

## Компоненты

```mermaid
flowchart TB
  client["Клиент MAX<br/>мобильный и веб"]
  botapi["MAX Bot API<br/>platform-api2.max.ru"]

  subgraph VPS["Наш сервер · Docker Compose"]
    caddy["Caddy · HTTPS :443"]
    miniapp["miniapp<br/>React, статика"]
    subgraph server["server · один процесс Node.js"]
      direction TB
      auth["auth<br/>подпись initData"]
      api["api<br/>маршруты, права, статусы"]
      matching["matching<br/>расчёт совпадения"]
      bot["bot<br/>очередь уведомлений"]
    end
    db[("PostgreSQL")]
  end

  client -->|"мини-приложение"| caddy
  caddy --> miniapp
  caddy -->|"/api/*"| auth --> api
  api --> matching
  api -->|"события"| bot
  api --> db
  bot --> db
  bot -->|"POST /messages"| botapi
  botapi -->|"вебхук /bot/webhook"| caddy
  botapi -.->|"сообщения от бота"| client
```

| Компонент | Роль | Связи |
|---|---|---|
| Клиент MAX | открывает бота и мини-приложение, подписывает данные запуска | → Caddy по HTTPS |
| Caddy | TLS-сертификат, маршрутизация по пути | `/api/*`, `/bot/*` → server; остальное → miniapp |
| miniapp | экраны студента и работодателя | → `/api` с заголовком `X-Max-Init-Data` |
| server · auth | проверяет подпись MAX на каждом запросе, находит пользователя | → db |
| server · api | профили, стажировки, лента, отклики, кандидаты; права и статусы | → matching, → db, публикует события |
| server · matching | чистые функции: фильтры и процент с расшифровкой | без БД и сети |
| server · bot | `/start`, уведомления по событиям, очередь с лимитами MAX | ← события, → db, → MAX Bot API |
| PostgreSQL | все данные | только внутри сети Docker |

**Почему так:** один процесс для API и бота — меньше движущихся частей; события внутри процесса — API не знает про
Bot API, бот не знает про HTTP; очередь уведомлений в той же БД — без отдельного брокера; расчёт совпадения — чистые
функции, которые покрыты тестами без БД.

## Основной сценарий

```mermaid
sequenceDiagram
  autonumber
  actor E as Работодатель
  actor S as Студент
  participant M as Мини-приложение
  participant A as server · api
  participant B as server · bot
  participant X as MAX Bot API

  E->>M: профиль компании, форма стажировки
  M->>A: POST /api/internships
  A-->>B: internship.created
  B->>X: студентам с совпадением ≥ 60 %: карточка и кнопка «Открыть»
  X-->>S: сообщение от бота
  S->>M: открывает карточку: процент и что совпало
  M->>A: POST /api/internships/:id/interest «Интересно»
  A-->>B: interest.created
  B->>X: работодателю: «Новый кандидат, совпадение N %»
  E->>M: список кандидатов по убыванию совпадения
  M->>A: POST …/candidates/:id/invite
  A-->>B: interest.invited
  B->>X: студенту — контакт работодателя и чек-лист, работодателю — контакт студента
  Note over A: телефон и фамилия студента раскрываются<br/>только после приглашения
```

## Статусы отклика

```mermaid
stateDiagram-v2
  [*] --> skipped: «Пропустить»
  [*] --> interested: «Интересно»
  skipped --> interested: передумал
  interested --> skipped: передумал
  interested --> invited: работодатель пригласил
  interested --> declined: работодатель отказал
  invited --> [*]
  declined --> [*]
```

Повтор того же действия ничего не меняет и не шлёт уведомление второй раз. Недопустимый переход — `409`.

## Данные

```mermaid
erDiagram
  users ||--o| student_profiles : "анкета"
  users ||--o| employers : "компания"
  employers ||--o{ internships : "публикует"
  users ||--o{ interests : "откликается"
  internships ||--o{ interests : "получает"
  users ||--o{ notifications : "получает"
  skills }o..o{ student_profiles : "коды в skills[]"
  skills }o..o{ internships : "коды в required_skills[], nice_skills[]"

  users {
    bigint max_user_id UK
    text phone "только подтверждённый MAX"
    timestamptz consent_at
    bool is_demo
  }
  student_profiles {
    text university
    smallint course
    text city
    text_arr formats
    text_arr skills
  }
  employers {
    text company_name
    text city
    text contact_name
  }
  internships {
    text title
    text_arr required_skills
    text_arr nice_skills
    text format
    text status "open, closed"
    text source "employer, demo, trudvsem"
  }
  interests {
    text status "skipped, interested, invited, declined"
    smallint match_score
    jsonb match "расшифровка на момент отклика"
  }
  notifications {
    text dedupe_key UK "без повторных сообщений"
    text status "pending, sent, failed"
    timestamptz next_attempt_at
  }
```

Схема — в миграциях `apps/server/src/db/migrations/`, они применяются при старте сервера.
