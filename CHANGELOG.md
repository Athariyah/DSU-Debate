# Changelog — DSU Debate SQLite + универсальные мероприятия

## [2.0.1] — 2026-09-24

### Логотип PWA: убраны белые рамки вокруг иконки

- `public/icon-monochrome-192.png`, `public/icon-monochrome-512.png` — новая пара иконок с `purpose: "monochrome"`: прозрачный фон, силуэт трофея одной заливкой, звезда на чаше — вырез (`fill-rule="evenodd"`), иначе она сливается с чашей. Темизированные лаунчеры (Material You на Android 13+, монохромные темы на ПК) рисуют такой трафарет сами и не подкладывают под логотип свою светлую плитку — именно она выглядела как широкая белая рамка вокруг знака.
- `tools/generate-icons.mjs` — генератор монокромной иконки + самопроверка по ней; масштаб эмблемы в maskable поднят 1.8 → 2.0 (трофей 264×238.5 px, крайняя точка 193.6 из безопасной зоны 204.8). Все иконки (`any`, `maskable`, `monochrome`, `apple-touch`) залиты фоном до самых краёв: светлых пикселей на границе нет ни одного (проверено по пикселям PNG).
- `public/manifest.webmanifest` — иконки сгруппированы по назначению (`any` / `maskable` / `monochrome`); добавлены обе монокромные.
- `public/sw.js` — `CACHE_NAME` v4 → v5, в precache добавлены монокромные иконки: статика отдаётся cache-first, поэтому без смены версии уже установленное приложение продолжало показывать старые иконки из кэша.
- `index.html` — фавиконка теперь тот же файл, что логотип PWA (`/logo.svg` + PNG-фолбэк 192/512). Убрана отдельная инлайновая копия знака в `data:image/svg+xml`, которая расходилась с иконками по геометрии и рисовала свою плитку.

### Расположение элементов в интерфейсе

- `src/pages/AdminPage.tsx` — заголовок и кнопка «Создать» выровнены по нижней линии (`items-end`) вместо центрирования: при центрировании кнопка вставала на уровень подзаголовка «Protected admin area» и «висела» выше заголовка «Мероприятия». Подзаголовок и заголовок ужимаются (`min-w-0` + `truncate`), кнопка не выдавливается на отдельную строку.
- `src/pages/AdminPage.tsx` — подпись «Тип» и счётчик «N/M» вынесены в отдельную строку над чипами фильтра: при переносе чипов (узкий экран, 150% зум) счётчик с `ml-auto` уезжал в самый низ блока и отрывался от подписи.
- `src/pages/HomePage.tsx`, `src/pages/DebatesPage.tsx` — пустые состояния списков («Пока нет запланированных мероприятий», «История пока пуста») стали карточками в стиле остальных блоков (`glass-panel`, `rounded-3xl`) и занимают всю ширину сетки на ПК. Раньше это были строки текста без рамки, которые визуально «съезжали» из списка.
- `src/pages/HomePage.tsx` — секция «Последние завершённые» больше не исчезает, когда история пуста: показывается карточка «Завершённых мероприятий пока нет».

### Тесты

- `src/pages/EmptyStates.test.tsx` — новые проверки: пустые состояния рендерятся карточками (а не строками без рамки) и занимают всю ширину сетки на главной и на странице мероприятий.
- Полный прогон: 93/95 (`RealFlow` — 2 теста требуют живого backend, ожидаемо), `tsc --noEmit` без ошибок.

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
