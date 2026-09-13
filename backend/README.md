# DSU Debate Backend

Express + Socket.io + PostgreSQL API for DSU Debate.

## Быстрый запуск с PostgreSQL

Из корня репозитория:

```bash
docker compose up -d db
cp backend/.env.example backend/.env
cd backend
npm ci
npm run build
npm run dev
```

SQL-схема монтируется в контейнер и применяется автоматически при первом создании
тома. Для уже существующего тома примените миграцию вручную:

```bash
docker compose exec -T db psql -U dsu -d dsu_debate < sql/schema.sql
```

Frontend запускается во втором терминале:

```bash
npm ci
npm run dev
```

Vite проксирует `/api` и `/socket.io` на `http://localhost:4000`. Для другого адреса
задайте `VITE_BACKEND_URL`, либо используйте абсолютные `VITE_API_URL` и
`VITE_SOCKET_URL`.

## Администратор

При наличии `ADMIN_EMAIL` и `ADMIN_PASSWORD` backend один раз создаёт пользователя,
если его ещё нет. Это удобно для локальной разработки и не перезаписывает существующий
аккаунт. В production переменные должны быть заданы явным образом.

После запуска получить JWT можно через login:

```bash
curl -s http://localhost:4000/api/admin/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@dsu.local","password":"ChangeMe123!"}'
```

Скопируйте `token` в раздел «Доступ администратора» на странице профиля frontend.

## Проверки

```bash
npm run typecheck
npm run build
```

Полный REST и Socket.io контракт находится в `../docs/API_SPEC.md`.
