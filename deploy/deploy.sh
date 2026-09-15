#!/usr/bin/env bash
# ===========================================================================
# DSU Debate — публикация обновлений на VPS (запускается с ВАШЕЙ машины)
# ===========================================================================
# Копирует код на сервер, собирает frontend + backend и перезапускает сервис.
#
#   DEPLOY_SSH=root@153.52.117.244 DEPLOY_PORT=51387 bash deploy/deploy.sh
#
# Необязательные переменные:
#   APP_DIR      каталог на сервере              (по умолчанию /opt/dsu-debate)
#   DEPLOY_SETUP 1 — прогнать полную настройку    (по умолчанию: только если
#                        сервиса ещё нет на сервере)
#   DEPLOY_SSH_KEY  путь к приватному ключу
#
# Адрес сервера намеренно НЕ зашит в репозиторий — передавайте его переменной.
# ===========================================================================
set -Eeuo pipefail

: "${DEPLOY_SSH:?укажите DEPLOY_SSH, например DEPLOY_SSH=root@1.2.3.4}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
APP_DIR="${APP_DIR:-/opt/dsu-debate}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SSH_OPTS=(-p "$DEPLOY_PORT" -o ServerAliveInterval=15)
[[ -n "${DEPLOY_SSH_KEY:-}" ]] && SSH_OPTS+=(-i "$DEPLOY_SSH_KEY")

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }

log "проверяю подключение к $DEPLOY_SSH (порт $DEPLOY_PORT)"
ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH" 'echo ok; uname -sr' >/dev/null

log "копирую код в $APP_DIR (без .git, node_modules, dist, .localdb)"
ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH" "install -d -m 755 '$APP_DIR'"
tar czf - \
  --exclude=.git --exclude=node_modules --exclude=dist \
  --exclude=.localdb --exclude=.env --exclude='backend/.env' \
  -C "$REPO_ROOT" . \
  | ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH" "tar xzf - -C '$APP_DIR'"

NEED_SETUP="${DEPLOY_SETUP:-}"
if [[ -z "$NEED_SETUP" ]]; then
  if ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH" \
       "test -f /etc/systemd/system/dsu-debate-backend.service"; then
    NEED_SETUP=0
  else
    NEED_SETUP=1
    log "сервис ещё не настроен — будет полная настройка (нужны ADMIN_EMAIL/ADMIN_PASSWORD)"
  fi
fi

if [[ "$NEED_SETUP" == "1" ]]; then
  ssh -t "${SSH_OPTS[@]}" "$DEPLOY_SSH" \
    "cd '$APP_DIR' && sudo FORCE_BUILD=1 \
       SITE_DOMAIN='${SITE_DOMAIN:-}' \
       ADMIN_EMAIL='${ADMIN_EMAIL:-}' \
       ADMIN_PASSWORD='${ADMIN_PASSWORD:-}' \
       bash deploy/setup.sh"
else
  log "собираю и перезапускаю"
  ssh "${SSH_OPTS[@]}" "$DEPLOY_SSH" "cd '$APP_DIR' && \
      (cd backend && npm ci --no-audit --no-fund && npm run build) && \
      npm ci --no-audit --no-fund && npm run build && \
      install -d -m 755 /var/www/dsu-debate/dist && \
      cp -a dist/. /var/www/dsu-debate/dist/ && \
      chmod -R a+rX /var/www/dsu-debate/dist && \
      systemctl restart dsu-debate-backend && \
      sleep 2 && \
      curl -fsS http://127.0.0.1:4000/api/health/ready && echo"
fi

log "готово"
