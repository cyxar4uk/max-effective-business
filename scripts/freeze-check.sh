#!/usr/bin/env bash
# Проверка перед заморозкой кода (задача #24). Запускать из корня репозитория на машине с Docker и Node.js 24:
#   scripts/freeze-check.sh
# Ничего не меняет в репозитории. В конце печатает хеш коммита для служебного слайда и формы сдачи.
set -uo pipefail
cd "$(dirname "$0")/.."

fails=0
logs=$(mktemp -d)
ok()   { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; fails=$((fails + 1)); }
warn() { printf '  !     %s\n' "$1"; }
step() { printf '\n== %s\n' "$1"; }

step "Git"
git fetch -q origin
branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = main ] && ok "ветка main" || fail "ветка $branch, а сдаём main"
[ -z "$(git status --porcelain)" ] && ok "рабочая копия чистая" || fail "есть незакоммиченные изменения"
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && ok "совпадает с origin/main" || fail "локальный main не равен origin/main (git pull / git push)"
git ls-files --error-unmatch .env >/dev/null 2>&1 && fail ".env в репозитории — секреты!" || ok ".env не в репозитории"

step "Сервер: типы, линтер, тесты на PostgreSQL"
pg=freeze-check-pg-$$
port=55999
(
  cd apps/server
  npm ci --no-audit --no-fund >/dev/null 2>&1 || exit 10
  npx tsc --noEmit >/dev/null 2>&1 || exit 11
  npx eslint . >/dev/null 2>&1 || exit 12
  docker run -d --rm --name "$pg" -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB=app_test \
    -p 127.0.0.1:$port:5432 postgres:18.6-alpine3.24 >/dev/null || exit 13
  for _ in $(seq 1 30); do docker exec "$pg" pg_isready -U app -d app_test >/dev/null 2>&1 && break; sleep 1; done
  sleep 1
  TEST_DATABASE_URL=postgres://app:app@127.0.0.1:$port/app_test npx vitest run >$logs/tests.log 2>&1
)
code=$?
docker stop "$pg" >/dev/null 2>&1
case $code in
  0) ok "typecheck, lint, $(grep -oE 'Tests +[0-9]+ passed' $logs/tests.log | tail -1)" ;;
  10) fail "npm ci" ;; 11) fail "typecheck" ;; 12) fail "lint" ;; 13) fail "не поднялся PostgreSQL в Docker" ;;
  *) fail "тесты — см. $logs/tests.log"; grep -E '×|FAIL' $logs/tests.log | head -5 ;;
esac

step "Docker Compose и скрипты"
envf=$(mktemp)
printf 'MAX_BOT_TOKEN=check\nPOSTGRES_PASSWORD=check\nDOMAIN=example.test\nACME_EMAIL=a@example.test\nMAX_WEBHOOK_SECRET=check_secret\n' >"$envf"
for o in "" compose.prod.yaml compose.proxy.yaml; do
  args=(-f compose.yaml); [ -n "$o" ] && args+=(-f "$o")
  docker compose --env-file "$envf" "${args[@]}" config --quiet 2>/dev/null && ok "compose.yaml ${o:++ $o}" || fail "compose.yaml ${o:++ $o}"
done
rm -f "$envf"
for s in scripts/*.sh; do bash -n "$s" && ok "bash -n $s" || fail "bash -n $s"; done
[ -d apps/miniapp ] && ok "apps/miniapp есть" || warn "apps/miniapp нет — README и compose описывают мини-приложение"
grep -qE '^\s+miniapp:' compose.yaml && ok "сервис miniapp в compose" || warn "сервиса miniapp в compose нет"

step "Секреты во всей истории git, все ветки (gitleaks)"
docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:v8.30.1 git /repo --no-banner --redact --log-opts="--all" >$logs/gitleaks.log 2>&1 \
  && ok "утечек нет ($(grep -oE '[0-9]+ commits scanned' $logs/gitleaks.log))" \
  || fail "gitleaks нашёл секреты — см. $logs/gitleaks.log; токен перевыпустить"

step "README"
todo=$(grep -nE 'TODO' README.md || true)
[ -z "$todo" ] && ok "TODO нет" || { fail "в README остались TODO:"; echo "$todo" | sed 's/^/          /'; }
grep -q 'этот блок удалить перед сдачей' README.md && fail "служебный блок для команды в начале README не удалён" || ok "служебного блока нет"

step "Итог"
hash=$(git rev-parse HEAD)
echo "  commit: $hash"
echo "  короткий: ${hash:0:7}"
if [ "$fails" -eq 0 ]; then echo "  Всё готово к сдаче. Этот hash — в служебный слайд и форму."; else echo "  Проблем: $fails. Исправить до заморозки."; exit 1; fi
