#!/usr/bin/env bash
# Подписать бота на вебхук или проверить подписки. Токен и секрет — из .env, в историю shell не попадают.
#   scripts/max-webhook.sh subscribe   # https://$DOMAIN/bot/webhook
#   scripts/max-webhook.sh list
#   scripts/max-webhook.sh unsubscribe
# Документация: https://dev.max.ru/docs-api/methods/POST/subscriptions
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

API="${MAX_API_BASE:-https://platform-api2.max.ru}"
URL="https://${DOMAIN:?Нет DOMAIN в .env}/bot/webhook"
: "${MAX_BOT_TOKEN:?Нет MAX_BOT_TOKEN в .env}"
# Токен и секрет передаём через stdin (curl -K -), чтобы они не были видны в списке процессов.
# $BODY, если задан, уходит телом запроса.
api() {
  { printf 'header = "Authorization: %s"\n' "$MAX_BOT_TOKEN"
    if [ -n "${BODY:-}" ]; then printf 'data = "%s"\n' "$(printf '%s' "$BODY" | sed 's/\\/\\\\/g; s/"/\\"/g')"; fi
  } | curl -sS -K - "$@"
}

case "${1:-list}" in
  subscribe)
    # Только события, которые обрабатывает бот
    BODY="{\"url\":\"$URL\",\"secret\":\"${MAX_WEBHOOK_SECRET:?Нет MAX_WEBHOOK_SECRET в .env}\",\"update_types\":[\"bot_started\",\"message_created\"]}" \
      api -X POST "$API/subscriptions" -H 'Content-Type: application/json'
    ;;
  unsubscribe)
    api -G -X DELETE "$API/subscriptions" --data-urlencode "url=$URL"
    ;;
  list)
    api "$API/subscriptions"
    ;;
  *) echo "subscribe | list | unsubscribe" >&2; exit 1 ;;
esac
echo
