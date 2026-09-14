#!/bin/sh
# Container entrypoint for the all-in-one image.
#
# 1. Renders /etc/nginx/templates/*.template -> /etc/nginx/conf.d/*.
#    IMPORTANT: this base image (node:22-alpine + `apk add nginx`) does NOT
#    contain the official nginx image's docker-entrypoint helpers
#    (/docker-entrypoint.d/20-envsubst-on-templates.sh) and has no envsubst
#    (gettext) installed — so the template is rendered HERE with sed, which
#    is part of busybox and always available.
# 2. Hands over to supervisord (see CMD), which runs the embedded stack
#    (PostgreSQL + Node backend) and nginx.
set -e

# Where nginx proxies /api and /socket.io.
# In the default "embedded" mode the whole stack (PostgreSQL + backend)
# runs inside THIS container, so the upstream is always localhost — any
# external value (e.g. a stale "backend" service name left over from the
# old 3-service deployment) is deliberately ignored. Only "proxy" mode
# honours $BACKEND_HOST.
if [ "${RUN_MODE:-embedded}" = "proxy" ]; then
  BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
else
  BACKEND_HOST=127.0.0.1
fi

mkdir -p /etc/nginx/conf.d
for templated in /etc/nginx/templates/*.template; do
  [ -e "$templated" ] || continue
  name=$(basename "$templated")
  conf="/etc/nginx/conf.d/${name%.template}"
  sed "s|__BACKEND_HOST__|${BACKEND_HOST}|g" "$templated" > "$conf"
  echo "[entrypoint] rendered $conf (BACKEND_HOST=${BACKEND_HOST})" >&2
done

# Fail fast with a clear log message if the rendered configuration is
# invalid — better than a silent supervisord/nginx restart loop.
nginx -t

exec "$@"
