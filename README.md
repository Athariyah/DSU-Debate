# DSU Debate

Production-ready foundation for live audience voting during debates.

The root `Dockerfile` builds an **all-in-one image**: nginx serving the React
SPA, the Express + Socket.io backend, and a built-in PostgreSQL — one
container runs the whole stack. That is exactly what single-container
deployment platforms (Kubernetes/Amvera and similar) need.

## Full stack via Docker

Requirements: Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000`. The single `app` service contains:

- PostgreSQL (data persisted in the `dsu-debate-postgres` volume);
- Express + Socket.io backend with automatic SQL migrations and admin bootstrap;
- nginx serving the React frontend and proxying REST + WebSocket traffic.

Default local administrator (seeded once into an empty database):

```text
Email:    admin@dsu.local
Password: ChangeMe123!
```

> Upgrading from the old 3-service compose stack (separate `db`/`backend`/
> `frontend` containers)? The embedded PostgreSQL may be a newer major
> version and cannot open the old volume — run `docker compose down -v`
> first (accepts data loss) and then `docker compose up --build`.

## Single-container deployment (Kubernetes / Amvera)

Just build and deploy the root `Dockerfile` image and **expose port 80** —
no separate backend or database services are required on the cluster:

```bash
docker build -t dsu-debate .
docker push <registry>/dsu-debate:<tag>
```

The container starts in this order (managed by supervisord):

1. initializes the internal PostgreSQL cluster on first run
   (`/var/lib/postgresql/data`);
2. starts PostgreSQL (bound to 127.0.0.1 only) and the backend
   (port 4000, migrations + admin seed);
3. starts nginx on port 80 (SPA + `/api` and `/socket.io` proxy).

### Environment variables

All of them are optional; the image ships with development-safe defaults so
it works out of the box on any public host name.

| Variable | Default | Notes |
| --- | --- | --- |
| `RUN_MODE` | `embedded` | `proxy` = run nginx only and proxy `/api` to `BACKEND_HOST:4000` |
| `BACKEND_HOST` | `127.0.0.1` | Upstream host for the nginx proxy in `proxy` mode. In the default `embedded` mode the backend always lives inside the container, so the upstream is forced to `127.0.0.1` and this variable is ignored (a stale `BACKEND_HOST=backend` from an old 3-service deployment cannot break the site) |
| `JWT_SECRET` | random per start | Set a stable value so admin sessions survive restarts |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@dsu.local` / `ChangeMe123!` | Seed admin created once if the `admins` table is empty |
| `CORS_ORIGIN` | `*` | Comma-separated origins; socket.io follows the same list |
| `COOKIE_SECURE` | `false` | Set `true` when the site is served over HTTPS only |
| `NODE_ENV` | `development` | See hardening below |
| `TRUST_PROXY` | `1` | Needed behind the platform's load balancer (anti-fraud uses the client IP) |
| `ALLOW_ADMIN_REGISTRATION` / `ADMIN_REGISTRATION_KEY` | `false` / — | Self-service admin registration |
| `DATABASE_URL` | `postgresql://dsu:dsu@127.0.0.1:5432/dsu_debate` | Full connection string; used when `DB_HOST` is empty |
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | — | Separate connection parameters (handy when the password is stored as a secret); `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` are accepted too |
| `DB_SSLMODE` | `disable` for localhost, `prefer` for a remote host | `disable`\|`allow`\|`prefer`\|`require`\|`verify-ca`\|`verify-full` |
| `DB_POOL_MAX` | `20` | Connection pool size (mind the limit of your managed DB plan) |
| `EMBEDDED_POSTGRES` | `true` | `false` skips the built-in PostgreSQL when an external database is used. See [docs/AMVERA_DB.md](docs/AMVERA_DB.md) |

### Persistence

The database lives at `/var/lib/postgresql/data` inside the container. Mount
a writable volume there to keep data across pod restarts/redeploys; without a
volume the app still works but the database is recreated (and re-migrated) on
every new pod.

### Production hardening

With `NODE_ENV=production` the backend fails closed and additionally
requires: a `JWT_SECRET` of at least 32 characters, non-default admin
credentials, `COOKIE_SECURE=true`, and an explicit (non-`*`) `CORS_ORIGIN`.
Set these as environment variables on the platform when moving to production.

## External (managed) database

By default the container runs its own PostgreSQL. To use a managed cluster
instead — for example **Amvera PostgreSQL (CNPG)** — point the backend at it
and switch the built-in server off:

```bash
# Internal Amvera domain (the app runs in Amvera):
DATABASE_URL=postgresql://<USER>:<PASSWORD>@amvera-athariyah-cnpg-dsu-debatedb-rw:5432/<DB>
# External domain (access from the internet — TLS is required):
DATABASE_URL=postgresql://<USER>:<PASSWORD>@dsu-debatedb-athariyyah.db-msk0.amvera.tech:5432/<DB>?sslmode=require

DB_SSLMODE=prefer        # or require for the external domain
EMBEDDED_POSTGRES=false  # do not start the built-in PostgreSQL
```

The same settings can be given as separate variables (`DB_HOST`, `DB_PORT`,
`DB_NAME`, `DB_USER`, `DB_PASSWORD`) so the password never ends up inside the
URL. Migrations run automatically on backend start; the connection can be
verified beforehand with `npm run db:check` (see `backend/README.md`).

Full reference, TLS modes and troubleshooting:
[docs/AMVERA_DB.md](docs/AMVERA_DB.md).

## Development without the all-in-one container

Backend-only workflow with a standalone database:

```bash
docker compose --profile db up -d db
cp backend/.env.example backend/.env
cd backend && npm ci && npm run db:migrate && npm run dev
```

In a second terminal:

```bash
npm ci
npm run dev
```

Vite proxies `/api` and `/socket.io` to backend port `4000`.

## Features

- anonymous audience voting with UUID and IP anti-fraud checks;
- PostgreSQL transactions and relational integrity constraints;
- JWT admin authentication with HttpOnly session cookie;
- protected `/admin` frontend route;
- event and participant CRUD;
- status management: `upcoming`, `active`, `completed`;
- completed-event history with pagination;
- live Socket.io result and status updates;
- readiness/liveness health checks;
- migration runner and local seed administrator;
- frontend and backend typecheck/test/build scripts.

## Verification

```bash
npm run typecheck
npm run test
npm run build
cd backend && npm run typecheck && npm run test && npm run build
```

Check the database connection (works for the built-in and any external
PostgreSQL, including Amvera CNPG):

```bash
cd backend && npm run db:check
```

API contract: `docs/API_SPEC.md`.
