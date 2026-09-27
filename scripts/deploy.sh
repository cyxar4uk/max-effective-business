#!/usr/bin/env bash
# Выкатить ветку (по умолчанию main) на прод-сервер одной командой:
#   DEPLOY_HOST=user@1.2.3.4 scripts/deploy.sh [ветка]
# На сервере заранее: Docker с compose, клон репозитория в $DEPLOY_DIR и заполненный .env (см. docs/deploy.md).
set -euo pipefail

HOST="${DEPLOY_HOST:?Укажите DEPLOY_HOST=user@host}"
DIR="${DEPLOY_DIR:-/opt/max-effective-business}"
BRANCH="${1:-main}"

ssh "$HOST" bash -s -- "$DIR" "$BRANCH" <<'REMOTE'
set -euo pipefail
cd "$1"
git fetch --quiet origin
git checkout --quiet "$2"
git reset --quiet --hard "origin/$2"
docker compose -f compose.yaml -f compose.prod.yaml up -d --build --remove-orphans
docker image prune -f >/dev/null
echo "Выкачено: $(git rev-parse --short HEAD) ($2)"
docker compose -f compose.yaml -f compose.prod.yaml ps --format '{{.Service}}: {{.Status}}'
REMOTE
