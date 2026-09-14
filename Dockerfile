# syntax=docker/dockerfile:1
#
# ALL-IN-ONE image: nginx (React SPA) + Node backend + PostgreSQL in ONE container.
#
# Designed for platforms that deploy a single container per project
# (Kubernetes / Amvera and similar): no external database or backend service
# is required — the platform only has to expose container port 80.
#
# Runtime environment variables (see README):
#   RUN_MODE        embedded (default) | proxy
#                   embedded = internal PostgreSQL + backend;
#                   proxy    = nginx only, proxies to $BACKEND_HOST
#   BACKEND_HOST    where nginx proxies /api and /socket.io (default 127.0.0.1)
#   JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, CORS_ORIGIN, COOKIE_SECURE, ...
#
# Local development with the classic 3-service docker-compose stack is NOT
# this image's mode: docker-compose.yml now runs this image as a single
# `app` service.

# ---------- 1. React frontend ----------
FROM node:22-alpine AS frontend
WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=/api
ARG VITE_SOCKET_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN npm run build

# ---------- 2. Express + Socket.io backend ----------
FROM node:22-alpine AS backend
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY sql ./sql
RUN npm run build

# ---------- 3. Runtime: nginx + node + postgresql ----------
FROM node:22-alpine
RUN apk add --no-cache nginx postgresql supervisor openssl

WORKDIR /app

COPY --from=frontend /app/dist /usr/share/nginx/html
COPY --from=backend  /app/dist /app/dist
COPY --from=backend  /app/sql /app/sql
COPY backend/package*.json ./
RUN npm ci --omit=dev

# nginx config is rendered at container start by /entrypoint.sh (deploy/):
# templates in /etc/nginx/templates become /etc/nginx/conf.d/*. The entrypoint
# substitutes the __BACKEND_HOST__ placeholder with sed (this base image has
# no official-nginx docker-entrypoint helpers and no envsubst), leaves nginx
# variables ($host, $uri, ...) untouched, and runs `nginx -t` before start.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY deploy/entrypoint.sh /entrypoint.sh
COPY deploy/embedded.sh /app/embedded.sh
COPY deploy/supervisord.conf /etc/supervisor/app.conf
RUN chmod +x /entrypoint.sh /app/embedded.sh

# Development-safe defaults so the single container works out of the box on
# any public host name. For production hardening override these on the
# platform (NODE_ENV=production, COOKIE_SECURE=true, explicit CORS_ORIGIN,
# a strong stable JWT_SECRET and non-default ADMIN_* credentials — see README).
ENV NODE_ENV=development \
    PORT=4000 \
    DATABASE_URL=postgresql://dsu:dsu@127.0.0.1:5432/dsu_debate \
    CORS_ORIGIN=* \
    TRUST_PROXY=1 \
    COOKIE_SECURE=false \
    ALLOW_ADMIN_REGISTRATION=false \
    ADMIN_EMAIL=admin@dsu.local \
    ADMIN_PASSWORD=ChangeMe123! \
    RUN_MODE=embedded \
    BACKEND_HOST=127.0.0.1

EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
CMD ["supervisord", "-n", "-c", "/etc/supervisor/app.conf"]
