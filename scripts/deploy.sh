#!/usr/bin/env bash
# Выкатить ветку (по умолчанию main) на прод-сервер одной командой:
#   DEPLOY_HOST=user@1.2.3.4 scripts/deploy.sh [ветка или коммит]
#   DEPLOY_MODE=proxy DEPLOY_HOST=… scripts/deploy.sh     # за уже работающим на сервере nginx/Caddy
#   DEPLOY_FORWARD_AGENT=1 …                              # нет deploy key: git на сервере берёт ваш ключ из ssh-agent
# На сервере заранее: Docker с compose, клон репозитория в $DEPLOY_DIR и заполненный .env (см. docs/deploy.md).
set -euo pipefail

HOST="${DEPLOY_HOST:?Укажите DEPLOY_HOST=user@host}"
DIR="${DEPLOY_DIR:-/opt/max-effective-business}"
BRANCH="${1:-main}"
case "${DEPLOY_MODE:-caddy}" in
  caddy) OVERRIDE=compose.prod.yaml ;;
  proxy) OVERRIDE=compose.proxy.yaml ;;
  *) echo "DEPLOY_MODE: caddy или proxy" >&2; exit 1 ;;
esac

ssh ${DEPLOY_FORWARD_AGENT:+-A} "$HOST" bash -s -- "$DIR" "$BRANCH" "$OVERRIDE" <<'REMOTE'
set -euo pipefail
cd "$1"
git fetch --quiet origin
# Ветка — берём её свежую версию с origin; иначе считаем аргумент коммитом (откат на конкретный хеш)
if git rev-parse --quiet --verify "origin/$2^{commit}" >/dev/null; then target="origin/$2"; else target="$2"; fi
git rev-parse --quiet --verify "$target^{commit}" >/dev/null || { echo "Нет такой ветки или коммита: $2" >&2; exit 1; }
git checkout --quiet --detach "$target"
# Режим за чужим прокси: общая сеть с прокси должна существовать до запуска
if [ "$3" = compose.proxy.yaml ]; then docker network inspect meb-edge >/dev/null 2>&1 || docker network create meb-edge >/dev/null; fi
docker compose -f compose.yaml -f "$3" up -d --build --remove-orphans
# Только свои старые образы: на сервере живут чужие проекты
docker image prune -f --filter label=com.docker.compose.project=max-effective-business >/dev/null
echo "Выкачено: $(git rev-parse --short HEAD) ($2)"
docker compose -f compose.yaml -f "$3" ps --format '{{.Service}}: {{.Status}}'
REMOTE
