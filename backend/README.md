# DSU Debate Backend

Express + Socket.io + PostgreSQL API for DSU Debate.

## Полный запуск через Docker Compose

Из корня репозитория:

```bash
cp .env.example .env
docker compose up --build
```

После запуска:

- frontend: `http://localhost:3000`
- backend: `http://localhost:4000`
- readiness: `http://localhost:4000/api/health/ready`
- PostgreSQL: `localhost:5432`

Compose запускает PostgreSQL, применяет схему, запускает миграции, backend и nginx
frontend. Данные PostgreSQL сохраняются в volume `dsu-debate-postgres`.

Для локальной разработки без Docker:

```bash
docker compose up -d db
cp backend/.env.example backend/.env
cd backend
npm ci
npm run db:migrate
npm run dev
```

В отдельном терминале из корня:

```bash
npm ci
npm run dev
```

Vite проксирует `/api` и `/socket.io` на `http://localhost:4000`.

## Подключение к БД

Параметры берутся из переменных окружения (см. `.env.example`):

1. Готовая строка — `DATABASE_URL`.
2. Либо отдельные переменные — `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
   `DB_PASSWORD` (и стандартные `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
   `PGPASSWORD`). Удобно для облачных панелей, где пароль хранится отдельным
   секретом.

TLS управляется переменной `DB_SSLMODE` (семантика libpq): `disable`, `allow`,
`prefer`, `require`, `verify-ca`, `verify-full`. По умолчанию для `localhost`
используется `disable`, для удалённого хоста — `prefer` (сначала пробуем TLS,
при неудаче — обычное соединение). Для внешних подключений к Amvera указывайте
`require`.

При старте backend ожидает готовности БД (`DB_CONNECT_RETRIES` попыток с
паузой `DB_CONNECT_RETRY_DELAY_MS`) — это спасает, когда облачный кластер
выходит из паузы не мгновенно.

Проверить соединение, не запуская сервер:

```bash
npm run db:check
```

Скрипт печатает целевое подключение (без пароля), состояние TLS, версию
сервера, список таблиц и применённые миграции.

Настройка управляемой БД Amvera (CNPG): [../docs/AMVERA_DB.md](../docs/AMVERA_DB.md).

## Миграции

Миграции находятся в `../sql/migrations` и запускаются автоматически перед стартом
backend. Вручную их можно применить командой:

```bash
npm run db:migrate
```

## Администратор

При наличии `ADMIN_EMAIL` и `ADMIN_PASSWORD` backend один раз создаёт пользователя,
если его ещё нет. Существующий аккаунт не перезаписывается.

Для локального `.env.example`:

```text
Email:    admin@dsu.local
Пароль:   ChangeMe123!
```

Затем вход выполняется в frontend через раздел «Профиль». JWT устанавливается также
в HttpOnly cookie; Bearer-токен оставлен для совместимости с ручными API-клиентами.

Публичная регистрация администратора закрыта в production. Для контролируемой
регистрации передавайте `X-Admin-Registration-Key`, совпадающий с
`ADMIN_REGISTRATION_KEY`.

## Проверки

```bash
npm run typecheck
npm run test
npm run build
```

Полный REST и Socket.io контракт находится в `../docs/API_SPEC.md`.
