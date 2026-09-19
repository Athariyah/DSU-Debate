#!/usr/bin/env bash
# ===========================================================================
# DSU Debate — первичная настройка VPS (Debian 12 / Ubuntu 22.04+)
# ===========================================================================
# Запускается НА СЕРВЕРЕ от root, когда код уже лежит в каталоге приложения
# (по умолчанию — каталог, из которого запускается скрипт, т.е. клон репо):
#
#   sudo SITE_DOMAIN=debate.example.com \
#        ADMIN_EMAIL=you@example.com \
#        ADMIN_PASSWORD='СильныйПароль!' \
#        bash deploy/setup.sh
#
# Скрипт идемпотентен: повторный запуск ничего не ломает и не перетирает
# /etc/dsu-debate/backend.env (секреты сохраняются).
#
# Что делает: Node.js, PostgreSQL, Caddy, пользователь dsu, база данных,
# /etc/dsu-debate/backend.env, systemd-юнит, /etc/caddy/Caddyfile, firewall.
# ===========================================================================
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${APP_DIR:-$REPO_ROOT}"
WEB_DIR="${WEB_DIR:-/var/www/dsu-debate}"
ENV_FILE="/etc/dsu-debate/backend.env"
APP_USER="${APP_USER:-dsu}"
DB_NAME="${DB_NAME:-dsu_debate}"
DB_USER="${DB_USER:-dsu}"
BACKEND_PORT="${BACKEND_PORT:-4000}"
NODE_MAJOR="${NODE_MAJOR:-22}"

SITE_DOMAIN="${SITE_DOMAIN:-}"          # пусто -> сайт по http://<IP-сервера>
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

log()  { printf '\033[1;34m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[setup]\033[0m %s\n' "$*" >&2; exit 1; }

trap 'warn "прервано на строке $LINENO"' ERR

# ---------------------------------------------------------------- 0. проверки
[[ $EUID -eq 0 ]] || die "нужен root: sudo bash deploy/setup.sh"
[[ -f /etc/os-release ]] && . /etc/os-release
case "${ID:-}${ID_LIKE:-}" in
  *debian*|*ubuntu*) : ;;
  *) warn "ОС '${ID:-?}' не Debian/Ubuntu — команды apt могут не сработать" ;;
esac
[[ -f "$REPO_ROOT/backend/package.json" ]] \
  || die "в $REPO_ROOT нет backend/package.json — сначала положите туда код репозитория"

export DEBIAN_FRONTEND=noninteractive

# ------------------------------------------------------- 1. адрес сайта (CORS)
PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
[[ -n "$PUBLIC_IP" ]] || die "не удалось определить IP сервера — укажите SITE_DOMAIN вручную"

if [[ -n "$SITE_DOMAIN" ]]; then
  SITE_ADDRESS="$SITE_DOMAIN"
  SITE_ORIGIN="https://$SITE_DOMAIN"
else
  SITE_ADDRESS="http://$PUBLIC_IP"
  SITE_ORIGIN="http://$PUBLIC_IP"
  warn "SITE_DOMAIN не задан: сайт будет на $SITE_ORIGIN без HTTPS."
  warn "Без домена Let's Encrypt сертификат не выпустится. Для HTTPS привяжите"
  warn "A-запись домена к $PUBLIC_IP и перезапустите скрипт с SITE_DOMAIN=..."
fi
log "адрес сайта: $SITE_ADDRESS (CORS_ORIGIN=$SITE_ORIGIN)"

# ------------------------------------------------------------- 2. пакеты ОС
log "apt update + базовые пакеты"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg sudo ufw openssl git >/dev/null

# ------------------------------------------------- 2b. swap (защита от OOM)
# На маленьких VPS (1 ГБ RAM и меньше) без подкачки сборка фронтенда и пики
# нагрузки могут привести к OOM-Killer: он убьёт Node-процесс или PostgreSQL.
# Если swap выключен — создаём файл подкачки (размер настраивается SWAP_SIZE_MB).
SWAP_SIZE_MB="${SWAP_SIZE_MB:-1024}"
if swapon --noheadings 2>/dev/null | grep -q .; then
  log "swap уже включён — пропускаю"
else
  log "swap отсутствует — создаю /swapfile (${SWAP_SIZE_MB} МБ)"
  if ! fallocate -l "${SWAP_SIZE_MB}M" /swapfile 2>/dev/null; then
    dd if=/dev/zero of=/swapfile bs=1M count="${SWAP_SIZE_MB}" status=none
  fi
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  # Часть VPS (OpenVZ/LXC без разрешённого swap) отклоняет swapon — это не
  # повод валить всю настройку: предупреждаем и продолжаем без подкачки.
  if swapon /swapfile 2>/dev/null; then
    grep -qE '^/swapfile\s' /etc/fstab || printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
    log "swap включён и прописан в /etc/fstab (переживёт перезагрузку)"
  else
    warn "не удалось включить swap (виртуализация OpenVZ/LXC?) — продолжаю без него"
    rm -f /swapfile
  fi
fi

# --------------------------------------------------------------- 3. Node.js
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  CURRENT_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [[ "$CURRENT_MAJOR" -ge 18 ]] && NEED_NODE=0 && log "Node.js $(node -v) уже есть"
fi
if [[ $NEED_NODE -eq 1 ]]; then
  log "ставлю Node.js ${NODE_MAJOR}.x (NodeSource)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
NODE_BIN="$(command -v node)"
[[ -n "$NODE_BIN" ]] || die "node не установлен"

# ------------------------------------------------------------ 4. PostgreSQL
if ! command -v psql >/dev/null 2>&1; then
  log "ставлю PostgreSQL"
  apt-get install -y -qq postgresql postgresql-contrib >/dev/null
fi
systemctl enable --now postgresql >/dev/null 2>&1 || service postgresql start

DB_PASSWORD="$(openssl rand -hex 24)"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  log "база $DB_NAME уже есть"
  # Пароль из существующей БД не читаем — берём тот, что уже в ENV_FILE.
  if [[ -f "$ENV_FILE" ]]; then
    DB_PASSWORD="$(grep -oP "(?<=^DATABASE_URL=postgresql://${DB_USER}:)[^@]+" "$ENV_FILE" || echo "$DB_PASSWORD")"
  fi
else
  log "создаю роль $DB_USER и базу $DB_NAME"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}'"
  sudo -u postgres psql -qc "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}"
fi

# ------------------------------------------------------------------ 5. Caddy
if ! command -v caddy >/dev/null 2>&1; then
  log "ставлю Caddy (официальный репозиторий)"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi
log "Caddy $(caddy version | cut -d' ' -f1)"

# Порт 80/443 должен быть свободен: nginx/apache перехватят его у Caddy.
for svc in nginx apache2; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    warn "$svc запущен и занимает порт 80. Отключаю его в пользу Caddy."
    systemctl disable --now "$svc" >/dev/null 2>&1 || true
  fi
done

# ------------------------------------------------- 6. пользователь и каталоги
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -m 755 "$WEB_DIR" /etc/dsu-debate /var/log/caddy
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
chmod 700 /etc/dsu-debate

# ------------------------------------------------------------- 7. backend.env
if [[ -f "$ENV_FILE" ]]; then
  log "$ENV_FILE уже существует — не трогаю (секреты сохранены)"
else
  [[ -n "$ADMIN_EMAIL" ]]    || die "нужен ADMIN_EMAIL (например ADMIN_EMAIL=you@example.com)"
  [[ -n "$ADMIN_PASSWORD" ]] || die "нужен ADMIN_PASSWORD (>= 8 символов)"
  JWT_SECRET="$(openssl rand -hex 32)"
  ADMIN_REG_KEY="$(openssl rand -hex 16)"
  log "создаю $ENV_FILE"
  sed -e "s|__DB_USER__|${DB_USER}|g" \
      -e "s|__DB_PASSWORD__|${DB_PASSWORD}|g" \
      -e "s|__DB_NAME__|${DB_NAME}|g" \
      -e "s|__JWT_SECRET__|${JWT_SECRET}|g" \
      -e "s|__SITE_ORIGIN__|${SITE_ORIGIN}|g" \
      -e "s|__ADMIN_EMAIL__|${ADMIN_EMAIL}|g" \
      -e "s|__ADMIN_PASSWORD__|${ADMIN_PASSWORD}|g" \
      -e "s|__ADMIN_REGISTRATION_KEY__|${ADMIN_REG_KEY}|g" \
      "$APP_DIR/deploy/backend.env.example" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  chown root:root "$ENV_FILE"
fi

# ------------------------------------------------------------ 8. сборка кода
build_app() {
  log "npm ci (backend)"
  (cd "$APP_DIR/backend" && npm ci --no-audit --no-fund)
  log "сборка backend -> backend/dist"
  (cd "$APP_DIR/backend" && npm run build)
  log "npm ci (frontend)"
  (cd "$APP_DIR" && npm ci --no-audit --no-fund)
  log "сборка frontend -> dist/index.html"
  (cd "$APP_DIR" && npm run build)
}
if [[ -f "$APP_DIR/backend/dist/server.js" && -f "$APP_DIR/dist/index.html" ]] \
   && [[ "${FORCE_BUILD:-0}" != "1" ]]; then
  log "сборка уже есть (FORCE_BUILD=1 — пересобрать)"
else
  build_app
fi

# Фронтенд отдаёт Caddy: копируем dist в /var/www и даём на чтение всем.
install -d -m 755 "$WEB_DIR/dist"
cp -a "$APP_DIR/dist/." "$WEB_DIR/dist/"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
find "$WEB_DIR/dist" -type d -exec chmod 755 {} +
find "$WEB_DIR/dist" -type f -exec chmod 644 {} +

# ------------------------------------------------------------- 9. systemd
log "ставлю systemd-юнит"
sed -e "s|__APP_DIR__|${APP_DIR}|g" \
    -e "s|__APP_USER__|${APP_USER}|g" \
    -e "s|__NODE_BIN__|${NODE_BIN}|g" \
    "$APP_DIR/deploy/dsu-debate-backend.service" > /etc/systemd/system/dsu-debate-backend.service
systemctl daemon-reload
systemctl enable dsu-debate-backend >/dev/null 2>&1
systemctl restart dsu-debate-backend

# --------------------------------------------------------------- 10. Caddyfile
log "ставлю /etc/caddy/Caddyfile"
cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%s)" 2>/dev/null || true
sed -e "s|__SITE_ADDRESS__|${SITE_ADDRESS}|g" \
    -e "s|__BACKEND_ADDR__|127.0.0.1:${BACKEND_PORT}|g" \
    -e "s|__WEB_ROOT__|${WEB_DIR}/dist|g" \
    "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null \
  || die "Caddyfile не прошёл валидацию — /etc/caddy/Caddyfile оставлен, поправьте вручную"
systemctl enable --now caddy >/dev/null 2>&1
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# -------------------------------------------------------------- 11. firewall
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp  >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
  log "ufw: разрешены 22, 80, 443"
fi

# --------------------------------------------------------------- 12. проверка
sleep 2
log "проверка backend: $(curl -fsS --max-time 10 "http://127.0.0.1:${BACKEND_PORT}/api/health/ready" || echo 'ОТВЕТА НЕТ — см. journalctl -u dsu-debate-backend -n 50')"
log "проверка сайта:   $(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1/" || echo 'ОТВЕТА НЕТ — см. journalctl -u caddy -n 50')"

cat <<EOF

============================ ГОТОВО ========================================
Сайт:      ${SITE_ORIGIN}
API:       ${SITE_ORIGIN}/api/health/ready
Админка:   ${SITE_ORIGIN}/admin  (${ADMIN_EMAIL:-<из $ENV_FILE>})

Логи:      journalctl -u dsu-debate-backend -f
           journalctl -u caddy -f
Обновить:  bash ${APP_DIR}/deploy/deploy.sh   (с вашей машины)
============================================================================
EOF
