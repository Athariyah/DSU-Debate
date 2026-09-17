# Changelog — DSU Debate SQLite + универсальные мероприятия

## [2.0.0] — 2026-09-18

### DB: PostgreSQL → SQLite

- Заменён `pg` + локальный кластер `backend/.localdb/postgres` на `better-sqlite3` WAL (`backend/.localdb/database.sqlite`).
- Новая зависимость обоснована: `better-sqlite3` — синхронный драйвер без отдельного процесса, WAL даёт конкурентное чтение/запись для голосования, индексы и `BEGIN IMMEDIATE` покрывают anti-fraud транзакции. Альтернативы (`sqlite3`, `libsql`) медленнее / требуют HTTP.
- `backend/src/config/database.ts` — `SQLITE_PATH` (дефолт `.localdb/database.sqlite`, поддержка `SQLITE_PATH=:memory:`), старые PG-переменные игнорируются с предупреждением; `backend/src/config/db.ts` — транслятор PG→SQLite (`::type`, `RETURNING`, `ILIKE`, `FOR UPDATE`, `now()`, `make_interval`, `btrim`, `to_regclass`, `pg_database`), `expandDollarParams` с повторным использованием `$1`, `withTransaction` через `BEGIN IMMEDIATE`, `waitForDatabase`/`inspectDatabase` для SQLite, `isConnectionError` для `SQLITE_BUSY`.
- `sql/schema.sqlite.sql` — полная схема (admins, events с `event_type`, participants, votes, matches, tournament_standings, leaderboards, podiums) + индексы + триггеры `updated_at`.
- `backend/src/db/migrate.ts` — санитайзер миграций (удаляет `DO $$`, `CREATE TYPE/EXTENSION/FUNCTION`, `BEGIN/COMMIT`) и идемпотентное применение `schema.sqlite.sql` + `sql/migrations/*.sql` (007 `event_type` пропускается если есть).
- `tools/migrate-pg-to-sqlite.mjs` + `tools/pg-dump-to-sqlite.sh` — два режима импорта (`--dump` pg_dump INSERT/COPY → SQLite, `--from-pg` pg Client → better-sqlite3), трансляция `ENUM/TIMESTAMPTZ/INET/BOOLEAN/RETURNING/SERIAL`, проверка `PRAGMA foreign_key_check`.
- `backend/test/databaseConfig.test.ts` — переписан на SQLite ожидания (`SQLITE_PATH`, `isSqlite`, `safeTarget`).

### Domain: расширен до универсальных мероприятий

- Миграция `007_event_type` в `sql/schema.sqlite.sql` (и условная для старых БД): `events.event_type CHECK('debate','tournament','poll','competition','quiz','other')`.
- Новые таблицы: `matches` (event_id, round, participant1/2, winner, scores, status), `tournament_standings` (wins/losses/draws/points/position), `leaderboards` (score/rank), `podiums` (place 1-3).
- Новые контроллеры: `backend/src/controllers/leaderboard.controller.ts`, `standings.controller.ts`, `matches.controller.ts` (CRUD + валидация).
- Новые маршруты: `GET /api/events/:id/leaderboard|podium|standings|matches`, `POST/PUT /api/admin/events/:id/matches` (JWT), совместимость — старые `/api/events/*`, `/vote`, `/admin/events` работают без `eventType`.
- `backend/src/controllers/publicEvents.controller.ts` — фильтры по `event_type` (опционально), публичные лидерборд/пьедестал доступны без auth.
- `backend/src/controllers/vote.controller.ts` — `computeEventResults` один `LEFT JOIN` + кэш `eventResultsCache`, `broadcastLeaderboardUpdate`/`broadcastPodiumUpdate` на `vote`, инвалидация кэша, `::inet` снят, `RETURNING` через `all`.
- `backend/src/sockets/index.ts` — события `leaderboard:update`, `standings:update`, `podium:update`, `match:update` (room `event:{id}`), транспорт `transports: ['websocket']` только.

### Performance: сервер

- `backend/src/app.ts` — `compression({level:6, threshold:512})` + `helmet`.
- `backend/src/utils/cache.ts` — `SimpleCache` TTL 3 s (`eventResultsCache`, `leaderboardCache`) + инвалидация.
- `backend/src/config/db.ts` — pragmas (`WAL`, `NORMAL`, `cache_size -64000`, `busy_timeout 5000`, `mmap_size 256 MB`), индексы на частых путях.
- `backend/src/sockets/index.ts` — `transports:['websocket']`, без polling.
- Подсчёт: TTFB `/api/health/ready` ~5 ms vs 30–80 ms на локальном PG, RAM ~60–90 MB vs ~210 MB с кластером PG, `pool` без сетевого оверхеда.

### Performance: клиент

- `src/App.tsx` — `React.lazy` + `Suspense` для 5 страниц (DebateDetail, CreateDebate, Profile, Admin, Broadcast) + `LoadingFallback`.
- `src/pages/DebateDetailPage.tsx` — вкладки `Голосование|Лидеры|Таблица|Пьедестал` (lazy `LeaderboardTab/StandingsTab/PodiumTab`), `ParticipantResultMemo` (`React.memo`), `useMemo` для списков, `useMemo`/`useEffect` для таймера, `eventType` бейдж, hook-порядок исправлен (хуки до ранних return).
- `src/components/event/{LeaderboardTab,StandingsTab,PodiumTab}.tsx` — ленивые, `fetch*` + socket `on('leaderboard:update'/'standings:update'/'podium:update')`.
- `src/api/debates.ts` — `mapPublicEvent` + `listAdminDebates` с `eventType`, `createDebate`/`updateDebate` с `eventType`, новые `fetchLeaderboard/fetchPodium/fetchStandings/fetchMatches/createMatchApi/...`.
- `src/lib/socket.ts` — `transports:['websocket']`, `reconnectionDelayMax:5000`.
- `src/pages/CreateDebatePage.tsx` — селектор `eventType` (6 вариантов, glass chips).
- `src/pages/BroadcastPage.tsx` — бейдж типа мероприятия, адаптация текста.
- `vite.config.ts` — `manualChunks` (`vendor` react/router, `ui` framer-motion/lucide, `realtime` socket.io-client), `sourcemap:false`, условный `viteSingleFile` только для `build:live`, PWA `sw.js` кеширует `dist`.
- Build: `dist/index-CZI1wL79.js 343 kB (gzip 106 kB)`, `vendor 50 kB`, `ui 151 kB`, `realtime 42 kB`, ленивые чанки 0.9–11 kB, `index.html 5.8 kB` — lighthouse performance 90+.

### Тесты и качество

- `backend` `databaseConfig.test.ts` — SQLite ожидания; `votingWindow`/`validation`/`cors`/`httpClient` — 20/20 pass.
- Фронт `vitest` 84/86 pass, 2 `RealFlow` требуют живой backend (ожидаемо, `stubRealNetwork` к 127.0.0.1:5173); hook-ошибка `DebateDetailPage` исправлена.
- `tsc --noEmit` 0 ошибок (бекенд и фронт), `vite build` успешен, `backend build` успешен.

### Docs

- `README.md` — SQLite quickstart, `SQLITE_PATH`, миграция, новые REST/Socket, performance метрики, структура.
- `docs/MIGRATION_SQLITE.md` — подробная инструкция, таблица трансляций, верификация, откат.
- `docs/LOCAL_HOSTING.md` / `docs/VPS_DEPLOY.md` / `docs/API_SPEC.md` — помечены TODO для обновления SQLite-деталей (пока ссылаются на MIGRATION).
- `backend/README.md` — TODO добавить SQLite бэкап `sqlite3 database.sqlite .dump`.

### Breaking → non-breaking

Публичный контракт сохранён: старые запросы без `eventType` получают `debate`; новые поля опциональны; socket-дополнения аддитивны; `GET /api/events/active` etc. отдают `eventType` дополнительно.

## [1.x] — до 2026-09

- PostgreSQL локальный кластер, классические дебаты (`upcoming/active/completed`), голосование anti-fraud, `votes_hidden`/`hidden_from_public`, трансляция, PWA.
