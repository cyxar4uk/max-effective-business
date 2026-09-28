# Заморозка и сдача (задача #24)

Заморозка кода — за 3 часа до дедлайна (`CLAUDE.md`). После неё в `main` ничего не мёржим.

## За 4 часа до дедлайна

1. Все PR, которые идут в сдачу, смёржены; остальные — закрыты или отложены до финала.
2. Из README удалены служебный блок (строки «Для команды … удалить перед сдачей») и все `TODO`; разделы Артёма
   («Назначение», «Основной сценарий», «Пошаговый сценарий проверки», «Известные ограничения») заполнены.
3. Прод выкачен из `main` (`DEPLOY_MODE=proxy scripts/deploy.sh`), `node scripts/smoke.mjs https://<домен> --no-auth`
   зелёный, сценарий пройден в MAX (см. [live_check.md](live_check.md)).

## Проверка

```bash
git checkout main && git pull
scripts/freeze-check.sh
```

Скрипт ничего не меняет. Проверяет ветку и чистоту рабочей копии, `.env` вне git, типы, линтер и все тесты
на временном PostgreSQL, три варианта compose, синтаксис скриптов, наличие мини-приложения, секреты во всей
истории git (все ветки), `TODO` и служебный блок в README. В конце печатает hash коммита.

## README на чужой машине

Кто-то из команды, кто не писал сервер, на своей машине — строго по README, без подсказок:

```bash
git clone https://github.com/cyxar4uk/max-effective-business.git && cd max-effective-business
cp .env.example .env    # MAX_BOT_TOKEN=local-check, POSTGRES_PASSWORD=любой
docker compose up --build
MAX_BOT_TOKEN=local-check node scripts/smoke.mjs
```

Всё, где пришлось догадываться, — правка в README до заморозки.

## Сдача

1. hash из `scripts/freeze-check.sh` — в служебный слайд ([service_slide.md](service_slide.md)) и в форму сдачи;
   они должны совпадать.
2. Ссылка на бота, ссылка на репозиторий (доступ для жюри — у Ильи как владельца), PDF презентации.
3. После отправки формы — никаких коммитов в `main`.
