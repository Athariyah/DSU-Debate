#!/bin/sh
# Container entrypoint for the all-in-one image.
#
# 1. Renders /etc/nginx/templates/nginx.conf.template -> /etc/nginx/nginx.conf.
#    The template is a COMPLETE nginx config (main/events/http), because the
#    Alpine nginx package includes /etc/nginx/conf.d/*.conf in the ROOT
#    context — a bare `server { ... }` snippet there makes nginx fail with
#    `"server" directive is not allowed here`.
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

# Stale snippets from older image builds would still be included by a
# distro nginx.conf, so make sure nothing unexpected is left behind.
rm -f /etc/nginx/conf.d/default.conf /etc/nginx/http.d/default.conf 2>/dev/null || true

sed "s|__BACKEND_HOST__|${BACKEND_HOST}|g" \
  /etc/nginx/templates/nginx.conf.template > /etc/nginx/nginx.conf
echo "[entrypoint] rendered /etc/nginx/nginx.conf (BACKEND_HOST=${BACKEND_HOST})" >&2

mkdir -p /run /var/log/nginx /var/lib/nginx/tmp

# Fail fast with a clear log message if the rendered configuration is
# invalid — better than a silent supervisord/nginx restart loop.
nginx -t

exec "$@"
