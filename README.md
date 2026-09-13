# DSU Debate

Production-ready foundation for live audience voting during debates.

## Full stack via Docker

Requirements: Docker Compose.

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

Open `http://localhost:3000`. The Compose stack contains:

- PostgreSQL with persistent volume;
- Express + Socket.io backend;
- automatic SQL migrations and admin bootstrap;
- nginx-served React frontend with REST and WebSocket proxy.

Default local administrator:

```text
Email:    admin@dsu.local
Password: ChangeMe123!
```

Change all development secrets before production deployment.

## Development without the frontend container

```bash
docker compose up -d db
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

API contract: `docs/API_SPEC.md`.
