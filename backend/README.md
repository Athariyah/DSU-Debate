# DSU Debate Backend (SQLite)

Express + Socket.io + SQLite (better-sqlite3, WAL) API. База — один файл `backend/.localdb/database.sqlite`, без отдельного процесса PostgreSQL.

## Быстрый старт

```bash
cd backend
npm install
npm run dev
```

Что происходит при первом запуске:

1. создаётся файл `backend/.localdb/database.sqlite` (если нет) с `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`;
2. применяется полная схема `sql/schema.sqlite.sql` (admins, events с `event_type`, participants, votes, matches, tournament_standings, leaderboards, podiums);
3. применяются миграции из `../sql/migrations` через санитайзер (транслируются PG-конструкции в SQLite, `BEGIN/COMMIT` и `DO $$` удаляются);
4. создаётся администратор `admin@dsu.local` / `ChangeMe123!` (в dev; смените через `ADMIN_PASSWORD`);
5. API слушает <http://127.0.0.1:4000> (`/api/health/ready` → `{"status":"ready","database":"ok","db":"sqlite"}`).

Данные — один файл; WAL-файлы `database.sqlite-wal`/`-shm` живут рядом пока процесс открыт.

## Управление SQLite

| Команда | Действие |
|---|---|
| `npm run db:check` | к какой БД подключается (`sqlite://… (WAL)`) + версия + таблицы |
| `npm run db:migrate` | применить миграции вручную |
| `npm run db:migrate:pg -- --dump=./dump.sql` | импорт pg_dump INSERT/COPY в SQLite |
| `npm run admin:list` | список администраторов |
| `npm run admin:reset -- --email=... --password=...` | сменить пароль |
| `npm run admin:add -- --email=... --password=...` | добавить администратора |

Бэкап и сброс:

```bash
# бэкап (горячий, консистентный)
sqlite3 backend/.localdb/database.sqlite ".backup backend/.localdb/backup.db"
# или дамп
sqlite3 backend/.localdb/database.sqlite .dump > backup.sql
# полный сброс
rm backend/.localdb/database.sqlite* && npm run dev
```

Старые команды `db:local`, `db:local:status`, `db:local:logs` и т.п. оставлены как заглушки для совместимости (пишут предупреждение и используют SQLite).

Данные и логи:

```
backend/.localdb/database.sqlite        # данные (WAL)
backend/.localdb/database.sqlite-wal    # WAL (пока открыт)
backend/.localdb/logs/                  # логи приложения (не PG)
```

## Настройки

Файл `backend/.env` (`.env.example` в `.gitignore`). Значения по умолчанию рабочие.

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `SQLITE_PATH` / `SQLITE_FILE` / `DB_PATH` | `backend/.localdb/database.sqlite` | путь к файлу БД (`:memory:` для тестов/E2E) |
| `PORT` | `4000` | порт API |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | `dev-only-secret` / `8h` | сессии администратора |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@dsu.local` / `ChangeMe123!` (dev) | локальный админ |
| `CORS_ORIGIN` | `*` в dev, явный список в prod | разрешённые origins |
| `TRUST_PROXY` | `0` | хопы за прокси |
| `COOKIE_SECURE` | `false` | `true` для HTTPS-only |
| `ALLOW_ADMIN_REGISTRATION` | `false` | самостоятельная регистрация |

Старые PG-переменные (`DATABASE_URL`, `DB_HOST`, `PGHOST`…) игнорируются с предупреждением `[db] ВНИМАНИЕ: ... использует SQLite`; используйте `SQLITE_PATH`.

## Внешняя БД (SQLite файл на диске/сети)

Достаточно указать файл:

```env
SQLITE_PATH=/data/dsu/database.sqlite
```

Для тестов:

```bash
SQLITE_PATH=:memory: npm test
SQLITE_PATH=./tmp/test.db npm run dev
```

Проверить подключение:

```bash
npm run db:check
```

## Миграция PostgreSQL → SQLite

Была Postgres (`backend/.localdb/postgres` кластер порт 55432). Для переноса без потерь:

```bash
# dump (если Postgres ещё жив)
pg_dump --data-only --inserts --column-inserts --no-owner --no-privileges \
  -h 127.0.0.1 -U postgres -d dsu_debate -f dump.sql

# импорт
node ../tools/migrate-pg-to-sqlite.mjs --dump=./dump.sql --sqlite=./.localdb/database.sqlite
# или прямой копией
PG_DUMP_URL=postgres://postgres:postgres@127.0.0.1:55432/dsu_debate \
  node ../tools/migrate-pg-to-sqlite.mjs --from-pg

# или shell
../tools/pg-dump-to-sqlite.sh "postgres://..." "./.localdb/database.sqlite"
```

Детали трансляции типов (`ENUM→TEXT CHECK`, `TIMESTAMPTZ→TEXT ISO`, `INET→TEXT`…) и верификация — `../docs/MIGRATION_SQLITE.md`.

## Миграции приложения

Миграции в `../sql/migrations` применяются автоматически при старте. Вручную:

```bash
npm run db:migrate
```

`backend/src/db/migrate.ts` санитайзит PG-синтаксис для SQLite (`DO $$`, `CREATE TYPE/EXTENSION`, `COMMENT ON` удаляются, `BEGIN/COMMIT` вне транзакции игнорируются). `schema_migrations` хранит версии; 007 `event_type` идемпотентна.

## Администратор

При первом старте создаётся администратор если нет (не перезаписывает существующего). `ADMIN_EMAIL`/`ADMIN_PASSWORD` действуют только при создании.

```bash
npm run admin:list
npm run admin:reset -- --email=admin@dsu.local --password=НовыйПароль123
```

Вход — во фронтенде «Профиль»; JWT в HttpOnly cookie + Bearer.

## Новые доменные таблицы

- `events.event_type` (`debate|tournament|poll|competition|quiz|other`)
- `matches` — пары участников по раундам
- `tournament_standings` — wins/losses/draws/points/position
- `leaderboards` — универсальный лидерборд (score/rank)
- `podiums` — топ-3

Индексы: `idx_events_status/type`, `idx_votes_event_participant`, `idx_leaderboards_event_score` и т.д. Транзакции `BEGIN IMMEDIATE` защищают anti-fraud.

## Checks

```bash
npm run typecheck
npm run test
npm run build
```

REST/Socket контракт — `../docs/API_SPEC.md`, хостинг — `../docs/LOCAL_HOSTING.md`, миграция — `../docs/MIGRATION_SQLITE.md`.
