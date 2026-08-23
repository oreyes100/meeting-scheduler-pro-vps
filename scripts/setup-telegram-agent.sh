#!/usr/bin/env bash
# Setup idempotente del agente de recibos por Telegram (módulo Cuentas).
#
# Uso (en el VPS, /opt/msp):
#   chmod +x scripts/setup-telegram-agent.sh
#   BOT_TOKEN=123:abc CHAT_ID=-100xxxx CONGRE_ID=<uuid> \
#   [GEMINI_API_KEY=xxx] [MODEL=gemini-flash-latest] \
#     ./scripts/setup-telegram-agent.sh https://tu-dominio.com
#
# Hace: genera/reutiliza TELEGRAM_WEBHOOK_SECRET en ecosystem.config.js,
# escribe GEMINI_API_KEY/MODEL si se pasan, vincula el chat en messaging_settings
# (SQLite), reinicia PM2 con --update-env y registra el webhook en Telegram.
set -euo pipefail

DOMAIN="${1:?Uso: $0 https://<dominio>  (con env: BOT_TOKEN CHAT_ID CONGRE_ID)}"
BOT_TOKEN="${BOT_TOKEN:?Falta BOT_TOKEN}"
CHAT_ID="${CHAT_ID:?Falta CHAT_ID (grupos: empieza por -100)}"
CONGRE_ID="${CONGRE_ID:?Falta CONGRE_ID (SELECT id FROM congregations;)}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
MODEL="${MODEL:-gemini-flash-latest}"

cd "$(dirname "$0")/.."
DB="${DB_PATH:-./data/msp.db}"
ECO="./ecosystem.config.js"
WEBHOOK_URL="${DOMAIN%/}/api/cuentas/telegram"

command -v sqlite3 >/dev/null || { echo "ERROR: sqlite3 no está instalado"; exit 1; }
[ -f "$DB" ] || { echo "ERROR: no existe la base $DB"; exit 1; }
CONGRE_NAME=$(sqlite3 "$DB" "SELECT name FROM congregations WHERE id='$CONGRE_ID';")
[ -n "$CONGRE_NAME" ] || { echo "ERROR: congregation_id '$CONGRE_ID' no existe"; exit 1; }

# ── 1. TELEGRAM_WEBHOOK_SECRET (+ GEMINI_API_KEY/MODEL) en ecosystem.config.js ─
if [ ! -f "$ECO" ]; then
  echo "ERROR: no existe $ECO (cópialo desde ecosystem.config.example.cjs)"; exit 1
fi

SECRET=$(node -e "
  const fs=require('fs'),p='$ECO';
  let m=fs.readFileSync(p,'utf8');
  const cur=m.match(/TELEGRAM_WEBHOOK_SECRET:\s*\"([^\"]+)\"/);
  const s=(cur&&!cur[1].startsWith('CHANGE_ME'))?cur[1]:require('crypto').randomBytes(24).toString('hex');
  m=cur?m.replace(/TELEGRAM_WEBHOOK_SECRET:\s*\"[^\"]+\"/, \`TELEGRAM_WEBHOOK_SECRET: \"\${s}\"\`)
       :m.replace(/env:\s*{/, \`env: {\n      TELEGRAM_WEBHOOK_SECRET: \"\${s}\",\`);
  if ('$GEMINI_API_KEY') {
    m=m.match(/GEMINI_API_KEY:\s*\"[^\"]+\"/)
      ?m.replace(/GEMINI_API_KEY:\s*\"[^\"]+\"/, \`GEMINI_API_KEY: \"'$GEMINI_API_KEY'\"\`)
      :m.replace(/env:\s*{/, \`env: {\n      GEMINI_API_KEY: \"'$GEMINI_API_KEY'\",\`);
  }
  m=m.match(/GEMINI_MODEL:/)?m.replace(/GEMINI_MODEL:\s*\"[^\"]+\"/, \`GEMINI_MODEL: \"$MODEL\"\`)
    :m.replace(/env:\s*{/, \`env: {\n      GEMINI_MODEL: \"$MODEL\",\`);
  fs.writeFileSync(p,m);console.log(s);
")
echo "✓ TELEGRAM_WEBHOOK_SECRET configurado en $ECO"

# ── 2. Vincular chat ↔ congregación en messaging_settings ─────────────────────
sqlite3 "$DB" "
  INSERT INTO messaging_settings
    (congregation_id, telegram_enabled, telegram_bot_token, telegram_chat_id, updated_at)
  VALUES ('$CONGRE_ID', 1, '$BOT_TOKEN', '$CHAT_ID', datetime('now'))
  ON CONFLICT(congregation_id) DO UPDATE SET
    telegram_enabled = 1,
    telegram_bot_token = excluded.telegram_bot_token,
    telegram_chat_id = excluded.telegram_chat_id,
    updated_at = datetime('now');
"
echo "✓ Chat $CHAT_ID vinculado a congregación '$CONGRE_NAME'"

# ── 3. Reiniciar la app para que cargue las nuevas variables de entorno ───────
pm2 restart meeting-scheduler-pro --update-env
sleep 2

# ── 4. Registrar el webhook en Telegram ───────────────────────────────────────
SET=$(curl -s "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  --data-urlencode "url=$WEBHOOK_URL" \
  --data-urlencode "secret_token=$SECRET" \
  --data-urlencode 'allowed_updates=["message","callback_query"]')
echo "$SET" | grep -q '"ok":true' || { echo "ERROR setWebhook: $SET"; exit 1; }
echo "✓ Webhook registrado: $WEBHOOK_URL"

# ── 5. Verificación ───────────────────────────────────────────────────────────
echo "--- Diagnóstico del servidor ---"
curl -s "$WEBHOOK_URL"
echo ""
echo "--- getWebhookInfo ---"
curl -s "https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo"
echo ""
echo "Listo. Envía una foto de recibo al grupo y prueba los botones ✅/❌."
