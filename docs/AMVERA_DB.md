# Подключение управляемой БД Amvera (PostgreSQL / CNPG)

Проект умеет работать как со встроенным PostgreSQL (по умолчанию), так и с
внешней управляемой БД. Ниже — настройка для кластера Amvera:

| Параметр | Значение |
| --- | --- |
| Внутренний домен (чтение/запись) | `amvera-athariyah-cnpg-dsu-debatedb-rw` |
| Внешний домен | `dsu-debatedb-athariyyah.db-msk0.amvera.tech` |
| Порт | `5432` |
| Имя БД / пользователь / пароль | задаются при создании кластера (имя `postgres` зарезервировано) |

- **Внутренний домен** доступен только из проектов Amvera — используйте его,
  если приложение DSU-Debate развёрнуто в Amvera.
- **Внешний домен** нужен для доступа из интернета (локальная разработка,
  VPS). Такое подключение Amvera отдаёт только по TLS.

## 0. Параметры кластера DSU-Debate

| Параметр | Значение |
| --- | --- |
| Имя БД | `DSU` |
| Пользователь | `Athariyyah` (НЕ superuser — приложению этого и не нужно) |
| Пароль | задаётся секретом, в репозиторий не попадает |
| Порт | `5432` |

Имя БД и имя пользователя в Amvera чувствительны к регистру — передавайте их
так, как указано выше. Пользователь `postgres` и база `postgres` зарезервированы.

## 1. Переменные окружения в панели Amvera

Раздел проекта → **Переменные**. Пароль добавьте как **секрет**.

Вариант А — отдельными переменными (рекомендуется, пароль не попадает в URL):

```env
DB_HOST=amvera-athariyyah-cnpg-dsu-debatedb-rw
DB_PORT=5432
DB_NAME=DSU
DB_USER=Athariyyah
DB_PASSWORD=<пароль>          # секрет
DB_SSLMODE=prefer
EMBEDDED_POSTGRES=false
```

Вариант Б — одной строкой:

```env
DATABASE_URL=postgresql://<USER>:<PASSWORD>@amvera-athariyah-cnpg-dsu-debatedb-rw:5432/<DB>?sslmode=prefer
EMBEDDED_POSTGRES=false
```

Для доступа из интернета (внешний домен) TLS обязателен:

```env
DATABASE_URL=postgresql://<USER>:<PASSWORD>@dsu-debatedb-athariyyah.db-msk0.amvera.tech:5432/<DB>?sslmode=require
```

> Внимание: если пароль содержит символы `@ : / # ? &`, указывайте его через
> отдельную переменную `DB_PASSWORD` (вариант А) или закодируйте его
> percent-encoding внутри `DATABASE_URL`.

`EMBEDDED_POSTGRES=false` отключает встроенный PostgreSQL внутри контейнера —
он больше не нужен и только расходует память. Если оставить `true`
(значение по умолчанию), контейнер по-прежнему поднимает локальный Postgres,
но бэкенд будет работать с внешней БД.

## 2. Проверка подключения

Из каталога `backend`:

```bash
npm ci
npm run db:check
```

Скрипт печатает, к чему подключились (без пароля), активен ли TLS, версию
сервера, список таблиц и применённые миграции:

```json
{
  "target": "postgresql://dsu_debate@amvera-athariyah-cnpg-dsu-debatedb-rw:5432/dsu_debatedb (sslmode=prefer)",
  "sslMode": "prefer",
  "database": "dsu_debatedb",
  "user": "dsu_debate",
  "tls": { "active": true, "version": "TLSv1.3", "cipher": "TLS_AES_256_GCM_SHA384" },
  "serverVersion": "PostgreSQL 16.x ...",
  "tables": ["admins", "events", "participants", "votes"],
  "migrations": ["001", "002"]
}
```

Если выводится `connection is NOT encrypted` для внешнего подключения —
задайте `DB_SSLMODE=require`.

## 3. Миграции

Миграции накатываются автоматически при старте бэкенда. Вручную:

```bash
cd backend && npm run db:migrate
```

## 4. Полный список переменных БД

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://dsu:dsu@127.0.0.1:5432/dsu_debate` | готовая строка подключения |
| `DB_HOST` / `PGHOST` | — | хост (приоритетнее `DATABASE_URL`) |
| `DB_PORT` / `PGPORT` | `5432` | порт |
| `DB_NAME` / `DB_DATABASE` / `PGDATABASE` | — | имя базы |
| `DB_USER` / `PGUSER` | — | пользователь |
| `DB_PASSWORD` / `PGPASSWORD` | — | пароль |
| `DB_SSLMODE` / `PGSSLMODE` | `disable` локально, `prefer` для удалённого хоста | `disable`, `allow`, `prefer`, `require`, `verify-ca`, `verify-full` |
| `DB_SSL_CA` / `DB_SSLROOTCERT` | — | путь к CA-сертификату для `verify-ca` / `verify-full` |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` для `verify-*` | проверять сертификат |
| `DB_POOL_MAX` | `20` | размер пула соединений (учитывайте лимит тарифа БД) |
| `DB_CONNECT_TIMEOUT` | `5` (сек) | таймаут подключения |
| `DB_CONNECT_RETRIES` | `10` | попытки подключения при старте |
| `DB_CONNECT_RETRY_DELAY_MS` | `3000` | пауза между попытками |
| `DB_IDLE_TIMEOUT` | `30000` (мс) | время жизни простаивающего соединения |
| `EMBEDDED_POSTGRES` | `true` | `false` — не запускать встроенный PostgreSQL |

## 5. Частые проблемы

**`password authentication failed`** — проверьте регистр имени пользователя и
пароля; в Amvera они чувствительны к регистру.

**`does not support SSL` / `tlsv1 alert`** — для внешнего домена укажите
`DB_SSLMODE=require`; для внутреннего оставьте `prefer` (драйвер сначала
пробует TLS, затем обычное соединение).

**`permission denied to create extension "pgcrypto"`** — не проблема:
миграция перехватывает эту ошибку и продолжает работу, `pgcrypto`
приложению не требуется.

**Бэкенд уходит в рестарт-луп при старте** — кластер БД мог быть на паузе:
увеличьте `DB_CONNECT_RETRIES` / `DB_CONNECT_RETRY_DELAY_MS`.

**`too many connections`** — уменьшите `DB_POOL_MAX` (на минимальных тарифах
Amvera лимит соединений невелик).

**`Connection terminated unexpectedly` / `read ECONNRESET` сразу после
подключения** — соединение рвётся до авторизации. Проверьте в панели Amvera:

1. статус кластера — должен быть **«PostgreSQL запущен»** (на паузе кластер
   не отвечает и прокси просто сбрасывает соединение);
2. статус внешнего домена типа POSTGRES — должен быть привязан.

Проверить из терминала (вне Amvera — по внешнему домену):

```bash
psql "postgresql://Athariyyah:<ПАРОЛЬ>@dsu-debatedb-athariyyah.db-msk0.amvera.tech:5432/DSU?sslmode=require" -c "\dt"
```

или из каталога `backend`:

```bash
DB_HOST=dsu-debatedb-athariyyah.db-msk0.amvera.tech DB_PORT=5432 DB_NAME=DSU \
DB_USER=Athariyyah DB_PASSWORD=<ПАРОЛЬ> DB_SSLMODE=require npm run db:check
```

Внутренний домен доступен только из проектов Amvera: с локальной машины и из
внешних CI он не резолвится — это нормально.
