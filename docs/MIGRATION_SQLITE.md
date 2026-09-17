# Миграция PostgreSQL → SQLite (DSU Debate)

## Обзор
Проект перешёл с PostgreSQL (локальный кластер `backend/.localdb/postgres` + порт 55432) на **SQLite + better-sqlite3** (один файл `backend/.localdb/database.sqlite`, WAL). Миграция без потерь, обратима дампом.

## Что транслируется

| PostgreSQL | SQLite |
|---|---|
| `ENUM('upcoming','active','completed')` | `TEXT CHECK(status IN (...))` |
| `event_type ENUM` (новое) | `TEXT CHECK(event_type IN (...))` |
| `TIMESTAMPTZ` / `TIMESTAMP` | `TEXT ISO8601 UTC` (`2026-09-17T12:00:00.000Z`) |
| `INET` | `TEXT` |
| `BOOLEAN` | `INTEGER 0/1` |
| `SERIAL` / `BIGSERIAL` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `RETURNING id` | поддерживается `better-sqlite3` ≥ 3.35 (`INSERT ... RETURNING` → `stmt.all`) |
| `ILIKE` | `LIKE COLLATE NOCASE` |
| `FOR UPDATE` / `FOR SHARE` | снято (блокировка через `BEGIN IMMEDIATE`) |
| `make_interval`, `now()` | `datetime(COALESCE(...), '+X minutes')`, `strftime(...)` |
| `btrim` | `trim` |

Индексы и внешние ключи сохранены; `WAL`, `busy_timeout=5000`, `cache_size=-64000`, `mmap_size=256 MB`.

## Скрипт

`tools/migrate-pg-to-sqlite.mjs` — два режима, `tools/pg-dump-to-sqlite.sh` — shell-обёртка.

### Режим A — pg_dump INSERT/COPY → SQLite (рекомендуется)

```bash
# 1. Снапшот старой БД
pg_dump --data-only --inserts --column-inserts --no-owner --no-privileges \
  -h 127.0.0.1 -U postgres -d dsu_debate -f dump.sql
# или с COPY (дешевле для больших таблиц)
pg_dump --data-only -h 127.0.0.1 -U postgres -d dsu_debate -f dump.sql

# 2. Импорт в SQLite (предварительно применяется sql/schema.sqlite.sql)
node tools/migrate-pg-to-sqlite.mjs --dump=./dump.sql --sqlite=./backend/.localdb/database.sqlite
# проверка
sqlite3 backend/.localdb/database.sqlite "SELECT count(*) FROM events; SELECT count(*) FROM votes; PRAGMA foreign_key_check;"
```

Скрипт:
- стирает `SET`, `SELECT pg_catalog`, `::type`, `TRUE/FALSE → 1/0`;
- `COPY ... FROM stdin` → серия `INSERT OR IGNORE`;
- выполняет инсерты в транзакции, игнор дублей `UNIQUE`.

### Режим B — прямая копия pg → sqlite

```bash
PG_DUMP_URL=postgres://postgres:postgres@127.0.0.1:55432/dsu_debate \
  node tools/migrate-pg-to-sqlite.mjs --from-pg --sqlite=./backend/.localdb/database.sqlite
```

Требует `npm install pg` (dev). Копирует `admins, events, participants, votes, schema_migrations` + опционально `matches, tournament_standings, leaderboards, podiums` (если уже есть). Конвертирует `Date→ISO`, `bool→0/1`, `inet→TEXT`.

### Shell one-liner

```bash
./tools/pg-dump-to-sqlite.sh "postgres://postgres:postgres@127.0.0.1:55432/dsu_debate" "./backend/.localdb/database.sqlite"
```

Сначала пробует `pg_dump`, при отсутствии — fallback на `--from-pg`.

## Верификация без потерь

```bash
# Postgres counts (до миграции)
psql "$PG_URL" -c "SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'participants', COUNT(*) FROM participants UNION ALL SELECT 'votes', COUNT(*) FROM votes;"

# SQLite counts (после)
sqlite3 backend/.localdb/database.sqlite "SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'participants', COUNT(*) FROM participants UNION ALL SELECT 'votes', COUNT(*) FROM votes;"

# Целостность
sqlite3 backend/.localdb/database.sqlite "PRAGMA foreign_key_check; PRAGMA integrity_check;"
# Должно быть пусто / ok
```

Сверяются также `admins` и `schema_migrations`.

## Откат

Сохраните `backend/.localdb/postgres` или `dump.sql` до миграции. Для отката:

```bash
# восстановить Postgres кластер из дампа
psql postgres://postgres:postgres@127.0.0.1:55432/dsu_debate -f dump.sql
# или вернуть postgres-файл конфигурации:
git checkout HEAD -- backend/src/config/database.ts  # если нужно
```

SQLite → Postgres обратная конвертация не предусмотрена (достаточно дампа).

## Переменные окружения

- `SQLITE_PATH` — путь к файлу SQLite (дефолт `backend/.localdb/database.sqlite`, `:memory:` для тестов/E2E).
- `PG_DUMP_URL` / `DATABASE_URL` — для `--from-pg`.
- Старые `PGHOST/PGPORT/PGUSER/PGDATABASE/DATABASE_URL` игнорируются (предупреждение в логе, см. `backend/src/config/database.ts`).

## Миграции приложения

`sql/schema.sqlite.sql` — полная схема (идемпотентна). `sql/migrations/*.sql` транслируются санитайзером `backend/src/db/migrate.ts` (удаляются `DO $$`, `CREATE TYPE/EXTENSION/FUNCTION`, `BEGIN/COMMIT`, `COMMENT ON`). `schema_migrations` хранит применённые версии (совместимо со старыми номерами — 007 `event_type` пропускается если колонка уже есть).

## VPS

Было: `setup.sh` ставил `postgresql` + `Caddy`. Стало: только `node` + `Caddy`; БД — один файл, бэкап `sqlite3 database.sqlite ".backup backup.db"` или `.dump`. См. `docs/VPS_DEPLOY.md`.

## Troubleshooting

- `SQLITE_BUSY / database is locked` — увеличьте `busy_timeout`, не держите два `BEGIN IMMEDIATE` параллельно; скрипт импорта использует `foreign_keys=OFF` на время bulk.
- `UNIQUE constraint failed` при INSERT — норма игнора дублей (`OR IGNORE` / `OR REPLACE`).
- `:memory:` данные не сохраняются между перезапусками — для прод используйте файл.
