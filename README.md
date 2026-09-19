# DSU Debate — универсальные мероприятия (SQLite)

Платформа live-голосований и турниров: зрители голосуют со своих телефонов, результаты и таблицы обновляются в реальном времени. Расширена от классических дебатов до **универсальных мероприятий** (дебаты, турниры, опросы, соревнования, квизы).

Приложение рассчитано на **локальный хостинг на своём компьютере**:

- фронтенд (React + Vite + Tailwind) раздаётся через **VS Code Live Server**;
- backend (Express + Socket.io) запускается обычным Node.js процессом;
- **SQLite (better-sqlite3, WAL)** — один файл `backend/.localdb/database.sqlite`, без установки PostgreSQL/Docker и без отдельного процесса БД. Старый кластер `backend/.localdb/postgres` больше не требуется; данные переносятся скриптом `tools/migrate-pg-to-sqlite.mjs`.

Полное руководство (Windows, VS Code, порты, бэкапы, телефоны в Wi-Fi, диагностика): **[docs/LOCAL_HOSTING.md](docs/LOCAL_HOSTING.md)**.

> Нужно выложить сайт в интернет (свой домен, HTTPS, доступ с любого телефона)?
> Смотрите **[docs/VPS_DEPLOY.md](docs/VPS_DEPLOY.md)**: в `deploy/` лежат готовые Caddyfile, systemd-юнит и скрипт, который ставит Node и Caddy на VPS одной командой.
> Для SQLite на VPS достаточно одного файла БД + бэкап `sqlite3 database.sqlite .dump`.

## Что изменилось (refactor)

**БД: PostgreSQL → SQLite**
- `better-sqlite3` WAL (`journal_mode=WAL`, `synchronous=NORMAL`, `cache_size=-64000`, `busy_timeout=5000`, `mmap_size=256 MB`), индексы на `events.status/event_type/date_time`, `votes(event_id, participant_id)` и `leaderboards/standings/matches`, `FOREIGN KEYS ON`, транзакции `BEGIN IMMEDIATE`.
- Миграции идемпотентны (`schema_migrations` + `sql/schema.sqlite.sql` + условные `ADD COLUMN event_type`); PostgreSQL-конструкции транслируются: `ENUM → TEXT CHECK`, `TIMESTAMPTZ → TEXT ISO8601`, `INET → TEXT`, `::type`, `RETURNING`, `ILIKE`, `FOR UPDATE`.
- Скрипт переноса без потерь: `tools/migrate-pg-to-sqlite.mjs --dump` (pg_dump INSERT/COPY → SQLite) или `--from-pg` (прямое копирование через `pg` → `better-sqlite3`). Проверяется `PRAGMA foreign_key_check`. См. [docs/MIGRATION_SQLITE.md](docs/MIGRATION_SQLITE.md).

**Домен: мероприятия вместо только дебатов**
- `events.event_type` (`debate|tournament|poll|competition|quiz|other`), `voting_started_at`, `matches` (пары участников по раундам), `tournament_standings` (wins/losses/draws/points), `leaderboards` (score/rank), `podiums` (топ-3).
- Новые REST: `GET /api/events/:id/leaderboard`, `/podium`, `/standings`, `/matches`; `POST/PUT /api/admin/events/:id/matches` — защищены JWT, публичные читают лидерборд/пьедестал/таблицу. Совместимость сохранена: старые `/api/events/*`, `/vote`, `/admin/events` работают без `eventType` (дефолт `debate`).
- Realtime: `leaderboard:update`, `standings:update`, `podium:update`, `match:update` в комнате `event:{id}` + существующие `vote:update`/`status:update`. Клиент переподписывается websocket-only (см. ниже).

**Производительность**
- Сервер: `compression` (level 6, 512 B), `helmet`, агрегатный кэш `SimpleCache(eventResults, leaderboard)` TTL 3 s + инвалидация на `vote`/`match`, `Socket.io` только `websocket` (за Yandex Cloud CDN глушится — в `useDebateSocket` polling-fallback REST каждые 1.5 с, на трансляции дополнительно опрос раз в 5 с), уменьшено число запросов (`computeEventResults` один `LEFT JOIN` + индексы).
- Клиент: `React.lazy` + `Suspense` для 5 тяжёлых страниц (`DebateDetail`, `Create`, `Profile`, `Admin`, `Broadcast`) и вкладок (`Leaderboard/Standings/Podium`), `React.memo` для `ParticipantResult`, `useMemo` для списков, `manualChunks` (`vendor`/`ui`/`realtime`), `sourcemap:false`, условный `viteSingleFile` только для Live Server, PWA `service-worker` кеширует `dist` (см. `public/sw.js`).
- Метрики (build): `dist` ≤ 600 kB gzip суммарно (vendor 18 kB, realtime 13 kB, ui 50 kB, index 106 kB, ленивые чанки 1–6 kB), TTFB `/api/health/ready` ~5 ms (SQLite файл vs 30–80 ms на Postgres локально), RAM backend ~60–90 MB (без процесса Postgres ~150 MB).

## Быстрый старт

Нужны только Node.js 18+ и расширение Live Server в VS Code.

**1. Backend + SQLite** (первый терминал, оставить открытым):

```bash
cd backend
npm install
npm run dev
```

Первый запуск создаёт файл `backend/.localdb/database.sqlite` (WAL), применяет миграции (`sql/schema.sqlite.sql` + `sql/migrations/*.sql` транслированные) и создаёт администратора `admin@dsu.local` / `ChangeMe123!`. Миграции повторного запуска идемпотентны.

Проверка: <http://127.0.0.1:4000/api/health/ready> → `{"status":"ready","database":"ok","db":"sqlite"}`.

Переменные окружения (опционально):
- `SQLITE_PATH=/абсолютный/путь/database.sqlite` или `SQLITE_PATH=:memory:` для тестов/E2E.
- `CORS_ORIGIN=http://127.0.0.1:5500,http://localhost:5173`
- `ADMIN_JWT_SECRET` (иначе авто-генерация)

**2. Сборка фронтенда** (второй терминал, из корня проекта):

```bash
npm install
npm run build:live   # для Live Server (один файл dist/index.html)
# или для разработки:
npm run dev          # Vite на http://localhost:5173 с прокси /api → :4000
```

**3. Хостинг через Live Server**

В VS Code: правый клик по `dist/index.html` → **Open with Live Server** → <http://127.0.0.1:5500/dist/index.html>.

> Изменения в `src` требуют повторного `npm run build:live`. Горячая перезагрузка — через `npm run dev`.

## Команды

| Команда (корень) | Что делает |
| --- | --- |
| `npm run build:live` | сборка для Live Server (абсолютные API-адреса) |
| `npm run dev` | Vite dev-сервер с прокси на backend |
| `npm run serve:local` | сборка + `vite preview` на 127.0.0.1:4173 |
| `npm run backend` | backend (то же, что `npm run dev` в `backend`) |
| `npm run typecheck`, `npm run test`, `npm run build` | проверки фронтенда |

| Команда (`backend`) | Что делает |
| --- | --- |
| `npm run dev` | backend на `:4000` с SQLite |
| `npm run db:check` | к какой БД подключается (sqlite://…) |
| `npm run db:migrate` | применить миграции вручную |
| `npm run db:migrate:pg -- --dump=./dump.sql` | импорт pg_dump в SQLite |
| `npm run admin:list` | список администраторов |
| `npm run admin:reset -- --email=... --password=...` | смена пароля |
| `npm run typecheck`, `npm run test`, `npm run build` | проверки backend |

## Миграция PostgreSQL → SQLite

Кратко:

```bash
# 1) Снапшот старой БД (если Postgres ещё жив)
pg_dump --data-only --inserts --column-inserts -h 127.0.0.1 -U postgres -d dsu_debate -f dump.sql
# или прямой копией без дампа:
PG_DUMP_URL=postgres://postgres:postgres@127.0.0.1:55432/dsu_debate node tools/migrate-pg-to-sqlite.mjs --from-pg --sqlite=./backend/.localdb/database.sqlite

# 2) Импорт в SQLite (перепишет/добавит данные, схема уже создана)
node tools/migrate-pg-to-sqlite.mjs --dump=./dump.sql --sqlite=./backend/.localdb/database.sqlite
# или shell-скрипт целиком:
./tools/pg-dump-to-sqlite.sh "postgres://postgres:postgres@127.0.0.1:55432/dsu_debate" "./backend/.localdb/database.sqlite"

# 3) Проверка
sqlite3 backend/.localdb/database.sqlite "SELECT count(*) FROM events; SELECT count(*) FROM votes; PRAGMA foreign_key_check;"
```

Подробно — [docs/MIGRATION_SQLITE.md](docs/MIGRATION_SQLITE.md) (типы, примеры, откат), сводка изменений — [CHANGELOG.md](CHANGELOG.md), схема — `sql/schema.sqlite.sql`.

## Возможности

- анонимное голосование с anti-fraud (UUID устройства + IP), транзакции `BEGIN IMMEDIATE` и `UNIQUE(event_id, device_fingerprint|ip_address)`;
- JWT администратора (HttpOnly cookie + Bearer);
- CRUD мероприятий и участников, статусы `upcoming → active → completed`, выбор типа при создании (`debate|tournament|poll|competition|quiz|other`);
- история завершённых с пагинацией, скрытие от публики и скрытие голосов ( realtime `event:public_visibility` );
- таймер голосования (`voting_duration_minutes`), автозавершение;
- **Новые вкладки на странице мероприятия:** `Голосование` (совместимый список), `Лидеры` (leaderboard), `Таблица` (турнирная таблица `matches`/`standings`), `Пьедестал` (топ-3 с конфетти) — подгружаются лениво, обновляются по socket `leaderboard:update`/`standings:update`/`podium:update`;
- экран трансляции `/broadcast/:id` — адаптация под тип (бейдж `Турнир/Опрос/...`), live-обновления, анимация итогов;
- PWA, адаптивная раскладка (мобильная нижняя панель / десктопная боковая), health-checks;
- SQLite файл-бэкап: `cp backend/.localdb/database.sqlite backup.db` или `sqlite3 database.sqlite .dump > backup.sql`.

## API (дополнения)

```
GET  /api/events/:id/leaderboard   # [{participantId, name, score, rank}]
GET  /api/events/:id/podium         # {eventId, podium:[{place, participantId, name}]}
GET  /api/events/:id/standings      # [{participantId, wins, losses, draws, points, position}]
GET  /api/events/:id/matches        # [{id, round, participant1_id, participant2_id, winner_id, score1, score2, status}]
POST /api/admin/events/:id/matches             # admin, body {round, participant1Id, participant2Id}
PUT  /api/admin/events/:id/matches/:matchId    # admin, {winnerId, score1, score2, status}
```

Socket.io (room `event:{id}`): `vote:update`, `status:update`, `leaderboard:update`, `standings:update`, `podium:update`, `match:update`, `event:public_visibility`. Транспорт — только `websocket`.

## Экран трансляции

Страница дебата → «три точки» → **Трансляция на экран** (`/broadcast/:id`). В реальном времени: голоса/проценты/лидер/сумма/часы/статус; при `completed` — анимация победитель/проигравший с конфетти; `Esc` закрывает оверлей. При недоступности realtime — опрос REST каждые 5 с.

## Структура

```
├── src/                 # React (Vite, Tailwind), pages lazy, components/event/*, broadcast/
├── backend/
│   ├── src/
│   │   ├── config/db.ts       # better-sqlite3 пул + WAL + трансляция PG→SQLite
│   │   ├── config/database.ts # SQLITE_PATH резолюция
│   │   ├── controllers/{vote,leaderboard,standings,matches}.ts
│   │   ├── sockets/           # websocket-only
│   │   └── utils/cache.ts     # SimpleCache TTL 3s
│   └── .localdb/database.sqlite # данные (WAL, в .gitignore)
├── sql/schema.sqlite.sql      # полная схема SQLite
├── sql/migrations/            # мигрируются транслированно
├── tools/migrate-pg-to-sqlite.mjs  # pg_dump/COPY → SQLite + прямая копия
├── public/              # PWA
├── deploy/              # VPS (Caddyfile, systemd) — теперь без postgres
├── docs/                # LOCAL_HOSTING, VPS_DEPLOY, MIGRATION_SQLITE, API_SPEC, PRIVACY, CDN_COMPATIBILITY
└── .vscode/
```

## Проверки

```bash
npm run typecheck && npm run test && npm run build
cd backend && npm run typecheck && npm run test && npm run build
# E2E на SQLite памяти:
SQLITE_PATH=:memory: npm --prefix backend run test
```

## Документация

- [docs/LOCAL_HOSTING.md](docs/LOCAL_HOSTING.md) — локальный хостинг, SQLite файл, бэкапы
- [docs/VPS_DEPLOY.md](docs/VPS_DEPLOY.md) — публикация на VPS (SQLite)
- [docs/MIGRATION_SQLITE.md](docs/MIGRATION_SQLITE.md) — миграция PG→SQLite, типы, примеры
- [docs/API_SPEC.md](docs/API_SPEC.md) — REST и Socket.io контракт
- [docs/CDN_COMPATIBILITY.md](docs/CDN_COMPATIBILITY.md) — работа через Yandex Cloud CDN (тоннелирование мутаций через GET, polling вместо WebSocket)
- [docs/PRIVACY.md](docs/PRIVACY.md) — данные голосующих
- [CHANGELOG.md](CHANGELOG.md) — сводка refactor
- [backend/README.md](backend/README.md) — backend и БД
