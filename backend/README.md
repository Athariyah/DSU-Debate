# DSU Debate Backend

Express + Socket.io + PostgreSQL API. База данных — **встроенная**: приложение
само создаёт и запускает кластер PostgreSQL на этом компьютере
(`backend/.localdb`), поэтому отдельно устанавливать PostgreSQL не нужно.

## Быстрый старт

```bash
cd backend
npm install
npm run dev
```

Что происходит при первом запуске (см. `src/localdb`):

1. бинарники PostgreSQL (`initdb`, `postgres`, `pg_ctl`) берутся из
   npm-пакета `embedded-postgres` — под вашу ОС и архитектуру;
2. в `backend/.localdb/postgres` создаётся кластер (UTF-8, только `127.0.0.1`,
   порт `55432`);
3. создаётся база `dsu_debate`;
4. применяются миграции из `../sql/migrations`;
5. создаётся локальный администратор `admin@dsu.local` / `ChangeMe123!`
   (в режиме разработки; смените пароль через `ADMIN_PASSWORD`);
6. API слушает <http://127.0.0.1:4000> (`/api/health/ready` для проверки).

При завершении процесса (Ctrl+C) PostgreSQL останавливается, данные остаются на
диске. Если БД уже запущена другим процессом, backend её переиспользует и не
останавливает.

Особенности поведения во время работы:

- перезапуск кода наблюдателем (ts-node-dev, nodemon) идёт с сигналом SIGTERM и
  **не** останавливает PostgreSQL — сайт не «прыгает» при каждом сохранении
  файла;
- если процесс PostgreSQL упал (или его убили), backend замечает ошибку
  соединения и поднимает его заново автоматически;
- ошибки соединения с БД в режиме разработки отдаются клиенту вместе с
  причиной (`details` в JSON ответа 500), полный стек — в логе backend.

## Управление локальной БД

| Команда | Действие |
| --- | --- |
| `npm run db:local` | создать (при первом запуске) и запустить БД в фоне |
| `npm run db:local:status` | состояние: порт, версия, размер данных, путь к логам |
| `npm run db:local:stop` | остановить БД (данные сохраняются) |
| `npm run db:local:restart` | перезапустить |
| `npm run db:local:doctor` | диагностика: бинарники, путь, порт, кластер, миграции |
| `npm run db:local:logs` | последние строки лога PostgreSQL |
| `npm run admin:list` | список администраторов в базе |
| `npm run admin:reset -- --email=... --password=...` | задать новый пароль администратору |
| `npm run admin:add -- --email=... --password=...` | добавить администратора |

Данные и логи:

```
backend/.localdb/postgres        # кластер (PGDATA) — это и есть ваши данные
backend/.localdb/logs/postgres.log
```

Бэкап = копия папки `backend/.localdb` при остановленной БД. Полный сброс =
удалить `backend/.localdb` и запустить backend снова.

## Настройки

Файл `backend/.env` (образец — [`.env.example`](.env.example), файл в
`.gitignore`). Значения по умолчанию рабочие, поэтому `.env` не обязателен.

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `LOCAL_DATABASE` | `auto` | `false` — не запускать встроенную БД |
| `LOCAL_DB_DIR` | `backend/.localdb` | каталог данных и логов |
| `LOCAL_DB_PORT` | `55432` | порт локального сервера |
| `LOCAL_DB_USER` / `LOCAL_DB_PASSWORD` | `postgres` / `postgres` | суперпользователь кластера |
| `LOCAL_DB_NAME` | `dsu_debate` | имя базы приложения |
| `LOCAL_DB_BIN_DIR` | — | каталог `bin` уже установленного PostgreSQL |
| `LOCAL_DB_TIMEOUT_MS` | `120000` | таймаут инициализации/запуска, мс |
| `PORT` | `4000` | порт API |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | `dev-only-secret` / `8h` | сессии администратора |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@dsu.local` / `ChangeMe123!` (dev) | локальный админ |
| `CORS_ORIGIN` | Live Server 5500–5503, Vite 5173–5174, preview 4173 | источники браузера или `*` |
| `TRUST_PROXY` | `0` | число хопов при работе за прокси |
| `COOKIE_SECURE` | `false` | `true`, если сайт доступен только по HTTPS |
| `ALLOW_ADMIN_REGISTRATION` / `ADMIN_REGISTRATION_KEY` | `false` / — | самостоятельная регистрация админов |

## Внешняя БД (необязательно)

Если у вас уже есть PostgreSQL (свой сервер или managed-кластер), задайте
подключение — тогда встроенная БД не запускается:

```env
DATABASE_URL=postgresql://dsu:dsu@localhost:5432/dsu_debate
# или отдельными переменными:
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dsu_debate
DB_USER=dsu
DB_PASSWORD=dsu
DB_SSLMODE=prefer          # disable | allow | prefer | require | verify-ca | verify-full
LOCAL_DATABASE=false       # если встроенную запускать не нужно вовсе
```

Стандартные libpq-переменные (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`,
`PGDATABASE`, `PGSSLMODE`) тоже распознаются. Проверить подключение без запуска
API:

```bash
npm run db:check
```

Команда печатает целевое подключение (без пароля), состояние TLS, версию
сервера, список таблиц и применённые миграции.

## Миграции

Миграции лежат в `../sql/migrations` и применяются автоматически перед стартом
backend. Вручную:

```bash
npm run db:migrate
```

## Администратор

При первом старте создаётся администратор, если его ещё нет (существующий
аккаунт никогда не перезаписывается). В режиме разработки это
`admin@dsu.local` / `ChangeMe123!`; свои значения задаются через
`ADMIN_EMAIL`/`ADMIN_PASSWORD`, но они действуют только при создании аккаунта.
Посмотреть список и сменить пароль:

```bash
npm run admin:list
npm run admin:reset -- --email=admin@dsu.local --password=НовыйПароль123
```

Вход выполняется во фронтенде через раздел «Профиль»; JWT также ставится в
HttpOnly cookie, Bearer-токен оставлен для совместимости с ручными
API-клиентами.

Публичная регистрация администратора закрыта: чтобы включить её, задайте
`ALLOW_ADMIN_REGISTRATION=true` и `ADMIN_REGISTRATION_KEY`.

## Проверки

```bash
npm run typecheck
npm run test
npm run build
```

Полный REST и Socket.io контракт — [../docs/API_SPEC.md](../docs/API_SPEC.md).
Локальный хостинг целиком (Windows, Live Server, бэкапы, диагностика) —
[../docs/LOCAL_HOSTING.md](../docs/LOCAL_HOSTING.md).
