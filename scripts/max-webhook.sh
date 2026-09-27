#!/usr/bin/env bash
# Подписать бота на вебхук или проверить подписки. Токен и секрет — из .env, в историю shell не попадают.
#   scripts/max-webhook.sh subscribe   # https://$DOMAIN/bot/webhook
#   scripts/max-webhook.sh list
#   scripts/max-webhook.sh unsubscribe
# Документация: https://dev.max.ru/docs-api/methods/POST/subscriptions
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

API="https://platform-api2.max.ru"
URL="https://${DOMAIN:?Нет DOMAIN в .env}/bot/webhook"
auth=(-H "Authorization: ${MAX_BOT_TOKEN:?Нет MAX_BOT_TOKEN в .env}")

case "${1:-list}" in
  subscribe)
    curl -sS -X POST "$API/subscriptions" "${auth[@]}" -H 'Content-Type: application/json' \
      -d "{\"url\":\"$URL\",\"secret\":\"${MAX_WEBHOOK_SECRET:?Нет MAX_WEBHOOK_SECRET в .env}\"}"
    ;;
  unsubscribe)
    curl -sS -X DELETE "$API/subscriptions?url=$URL" "${auth[@]}"
    ;;
  list)
    curl -sS "$API/subscriptions" "${auth[@]}"
    ;;
  *) echo "subscribe | list | unsubscribe" >&2; exit 1 ;;
esac
echo
