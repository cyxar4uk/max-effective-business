# Илья: как начать

Claude Code запускай **в корне** репозитория, чтобы он видел `apps/`. Скопируй сообщение ниже и отправь первым.

## Первое сообщение для Claude

```text
Привет. Я Илья — фулстек и дизайнер в команде на хакатоне MAX. Мы делаем бот центра карьеры в MAX для стажировок. На мне мини-приложение: обе роли, MAX Bridge, состояния экранов, режим ярмарки с QR.

Прочитай целиком: CLAUDE.md в корне, team/ilya/CLAUDE.md (это твоя инструкция), docs/03_product.md (особенно «Основной сценарий» и «Экраны»), docs/05_max_platform.md (раздел «Мини-приложение») и docs/04_criteria_map.md (строки с Ильёй).

Сначала проверь мои задачи: gh issue list --assignee @me --state open. Если пусто — работаем по стартовому плану из моей инструкции.

В первой сессии:
1. Перескажи в 5 пунктах мою зону и с кем я стыкуюсь.
2. Флоу экранов обеих ролей с переходами и состояниями (загрузка, пусто, ошибка, успех) — mermaid-схемой в team/ilya/flow.md.
3. Каркас apps/miniapp: Vite + React + TypeScript, MAX UI (установку проверь по README репозитория max-messenger/max-ui), скрипт MAX Bridge в index.html, скрипты dev/build/typecheck/lint.
4. Обёртка над window.WebApp: ready(), initData, start_param, BackButton, requestContact, openCodeReader, shareMaxContent. Вне MAX — заглушка для разработки в браузере.
5. Посмотри черновик контракта API в team/andrey/CLAUDE.md глазами потребителя. Замечания — в team/ilya/status.md, раздел «Нужно от других».

Работай в ветке ilya/miniapp-skeleton. В конце сессии обнови team/ilya/status.md, закоммить и запушь.
```
