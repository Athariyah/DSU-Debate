# Локальный хостинг: свой компьютер + VS Code Live Server

Приложение полностью работает на вашем компьютере: фронтенд раздаётся через
**VS Code Live Server**, backend — обычный Node.js процесс, а **PostgreSQL
приложение поднимает само** (отдельный кластер в папке проекта). Никаких
облаков, Docker и админских прав: ничего не устанавливается в систему и не
добавляется в автозагрузку.

```
┌─ VS Code Live Server ─────┐        ┌─ Node.js backend (npm run dev) ─┐
│  http://127.0.0.1:5500    │  HTTP  │  http://127.0.0.1:4000          │
│  dist/index.html (сборка) │ ─────► │  Express + Socket.io            │
└───────────────────────────┘  CORS  └───────────────┬─────────────────┘
                                                     │ 127.0.0.1:55432
                                        ┌────────────▼─────────────────┐
                                        │  PostgreSQL (встроенный)     │
                                        │  backend/.localdb            │
                                        └──────────────────────────────┘
```

| Что | Адрес / место | Кто поднимает |
| --- | --- | --- |
| Сайт (фронтенд) | `http://127.0.0.1:5500/dist/index.html` | VS Code Live Server |
| API + WebSocket | `http://127.0.0.1:4000` | `npm run dev` в папке `backend` |
| PostgreSQL | `127.0.0.1:55432`, данные в `backend/.localdb` | сам backend (перед стартом) |

## Что нужно установить

1. **Node.js 18+** (рекомендуется LTS 20 или новее) — <https://nodejs.org>.
2. **VS Code** + расширение **Live Server**
   (`ritwickdey.LiveServer` — VS Code предложит его установить, см.
   `.vscode/extensions.json`).

Интернет нужен только на шаге `npm install`: вместе с зависимостями один раз
скачиваются бинарники PostgreSQL (~40–110 МБ в зависимости от ОС).

## Шаг 1. Backend + база данных

```bash
cd backend
npm install
npm run dev
```

Первый запуск делает всё сам и печатает примерно такое:

```
[db:local] первый запуск: создаю кластер PostgreSQL в .../backend/.localdb/postgres
[db:local] кластер создан
[db:local] создана база dsu_debate
[db:local] встроенный PostgreSQL готов: postgres@127.0.0.1:55432/dsu_debate
[dsu-debate-backend] database: postgresql://postgres@127.0.0.1:55432/dsu_debate (sslmode=disable)
[migration] applied 001_initial.sql
[migration] applied 002_hardening.sql
[dsu-debate-backend] создан локальный администратор admin@dsu.local (пароль по умолчанию: ChangeMe123!)
[dsu-debate-backend] HTTP + Socket.io server listening on port 4000
```

Терминал должен остаться открытым — это и есть сервер приложения. Ctrl+C
корректно останавливает и API, и PostgreSQL; **данные остаются** в
`backend/.localdb`.

Полезно знать про поведение во время работы:

- **горячий перезапуск кода не трогает базу.** ts-node-dev перезапускает API при
  каждом сохранении файла, но PostgreSQL при этом продолжает работать — сайт не
  «прыгает» на несколько секунд;
- **упавшая база поднимается сама.** Если процесс PostgreSQL был убит (диспетчер
  задач, антивирус, выход из сна), backend в течение пары секунд запускает его
  заново; следующий запрос уже проходит;
- если окно терминала закрыли жёстко (не Ctrl+C), PostgreSQL может остаться
  работать в фоне — это безопасно (порт только локальный). Остановить:

  ```bash
  npm --prefix backend run db:local:stop
  ```

Проверить, что всё живо:

```bash
curl http://127.0.0.1:4000/api/health/ready      # {"status":"ready","database":"ok"}
```

Доступ администратора (создаётся один раз при первом старте на пустой базе):

```text
Email:  admin@dsu.local
Пароль: ChangeMe123!
```

Эти значения используются, только если в `backend/.env` не заданы свои
`ADMIN_EMAIL` / `ADMIN_PASSWORD`. Аккаунт создаётся **один раз**: если пароль
когда-то меняли, старый действовать не будет. Посмотреть список и задать новый
пароль можно в любой момент:

```bash
cd backend
npm run admin:list                                             # кто есть в базе
npm run admin:reset -- --email=admin@dsu.local --password=НовыйПароль123
npm run admin:add   -- --email=second@dsu.local --password=ЕщёОдин12345
```

Проверить вход прямо из терминала:

```bash
curl -X POST http://127.0.0.1:4000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dsu.local","password":"ChangeMe123!"}'
```

Ответ с `token` — вход работает; `INVALID_CREDENTIALS` — пароль другой (смените
его командой `admin:reset`). Перед публикацией в интернет обязательно смените
пароль и `JWT_SECRET` в `backend/.env`.

Не получается войти, а пароль вроде верный? Смотрите пункт «Внутренняя ошибка
сервера» в разделе диагностики ниже — чаще всего дело не в пароле.

## Шаг 2. Собрать фронтенд для Live Server

Во втором терминале, в корне проекта:

```bash
npm install
npm run build:live
```

Появится один самодостаточный файл `dist/index.html` — со встроенными JS/CSS и
абсолютными адресами API (`http://127.0.0.1:4000`). Именно абсолютные адреса
нужны потому, что Live Server — статический сервер и, в отличие от
`npm run dev`, не умеет проксировать запросы к API.

## Шаг 3. Запустить Live Server

1. В дереве файлов VS Code раскройте `dist`.
2. Правый клик по `index.html` → **Open with Live Server**.
3. Браузер откроет `http://127.0.0.1:5500/dist/index.html`.

Готово: сайт работает на вашем компьютере, данные — в вашей локальной
PostgreSQL. Источники `http://127.0.0.1:5500` и `http://localhost:5500` (а также
5501–5503) уже разрешены в настройках CORS backend.

> Изменения в исходниках (папка `src`) нужно пересобирать: `npm run build:live`.
> Для разработки с мгновенной перезагрузкой удобнее `npm run dev` (шаг ниже).

## Варианты запуска (на выбор)

| Команда | Что делает | Когда использовать |
| --- | --- | --- |
| `npm run dev` (в корне) | Vite dev-сервер на `http://localhost:5173`, сам проксирует `/api` и `/socket.io` на 4000 | Разработка: горячая перезагрузка |
| `npm run build:live` | Сборка `dist/index.html` с абсолютными адресами | Хостинг через VS Code Live Server |
| `npm run serve:local` | Собирает и поднимает `vite preview` на `http://127.0.0.1:4173` (с прокси) | Один терминал вместо Live Server |
| `npm --prefix backend run dev` | Только backend + локальная БД | Если API уже запущен, а нужен ещё один |

Одновременно нужны, как минимум, **backend** (шаг 1) и **один** из способов
отдачи фронтенда (Live Server, `npm run dev` или `npm run serve:local`).

## Управление локальной базой

Данные и логи лежат в `backend/.localdb`:

```
backend/.localdb/
├── postgres/            # сам кластер (PGDATA), тут ваши данные
└── logs/postgres.log    # лог сервера
```

| Команда (из папки `backend`) | Действие |
| --- | --- |
| `npm run db:local` | создать (при первом запуске) и запустить БД в фоне |
| `npm run db:local:status` | состояние: порт, версия, размер данных, путь к логам |
| `npm run db:local:stop` | остановить БД (данные сохраняются) |
| `npm run db:local:restart` | перезапустить |
| `npm run db:local:doctor` | диагностика: бинарники, путь, порт, кластер, миграции |
| `npm run db:local:logs` | последние строки лога PostgreSQL |
| `npm run db:check` | к какой БД реально подключается приложение |
| `npm run db:migrate` | применить миграции вручную (обычно делается автоматически) |
| `npm run admin:list` | список администраторов в базе |
| `npm run admin:reset -- --email=... --password=...` | задать новый пароль администратору |
| `npm run admin:add -- --email=... --password=...` | добавить ещё одного администратора |

Из корня проекта те же команды короче: `npm run db` и `npm run db:stop`.

### Бэкап и восстановление

Бэкап — это просто копия папки:

```bash
# 1. остановить БД, чтобы файлы были согласованы
npm --prefix backend run db:local:stop
# 2. скопировать папку backend/.localdb/postgres (и при желании весь .localdb)
# 3. снова запустить
npm --prefix backend run db:local
```

Восстановление — обратная операция: остановить БД, заменить папку
`backend/.localdb` копией, запустить.

### Полный сброс базы

```bash
npm --prefix backend run db:local:stop
rm -rf backend/.localdb          # Windows: rmdir /s /q backend\.localdb
npm --prefix backend run dev      # кластер, база, миграции и админ создадутся заново
```

### Свой PostgreSQL вместо встроенного

Если PostgreSQL уже установлен и вы хотите использовать именно его:

1. Создайте базу и пользователя (например `dsu_debate` / `dsu`).
2. В `backend/.env`:

```env
LOCAL_DATABASE=false
DATABASE_URL=postgresql://dsu:dsu@localhost:5432/dsu_debate
# либо отдельными переменными:
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=dsu_debate
# DB_USER=dsu
# DB_PASSWORD=dsu
```

Миграции применятся автоматически при старте.

Промежуточный вариант: оставить нашему кластеру данные в проекте, но
использовать бинарники установленного PostgreSQL —

```env
LOCAL_DB_BIN_DIR=C:\Program Files\PostgreSQL\17\bin
```

## Доступ с телефонов в той же Wi-Fi сети

Платформа создана для голосования зрителей, поэтому часто нужно открыть её с
телефонов. Схема: сайт и API раздаются с вашего компьютера.

1. Узнайте адрес компьютера в локальной сети: `ipconfig` (Windows) — строка
   «IPv4-адрес», например `192.168.1.42`.
2. Разрешите фронтенду обращаться к этому адресу: создайте файл
   `.env.live-server.local` в корне (он в `.gitignore`) и соберите заново:

   ```env
   VITE_API_URL=http://192.168.1.42:4000/api
   VITE_SOCKET_URL=http://192.168.1.42:4000
   ```

   ```bash
   npm run build:live
   ```

3. Разрешите браузеру телефона обращаться к API: в `backend/.env` укажите

   ```env
   CORS_ORIGIN=*
   ```

4. В настройках VS Code для Live Server откройте сайт наружу:

   ```jsonc
   "liveServer.settings.host": "0.0.0.0",
   "liveServer.settings.useLocalIp": true
   ```

5. Телефоны открывают `http://192.168.1.42:5500/dist/index.html`.

Разрешите Node.js в брандмауэре Windows для частных сетей, иначе телефон не
подключится. Наружу в интернет этот вариант по умолчанию не выходит.

> Важно: встроенная БД слушает только `127.0.0.1` — в сеть отдаётся лишь API,
> а сама база извне недоступна.

## Если что-то не работает

Сначала выполните диагностику — она объясняет проблему человеческим языком:

```bash
cd backend && npm run db:local:doctor
```

| Симптом | Причина и решение |
| --- | --- |
| **«Внутренняя ошибка сервера» при любом действии** | Это ответ самого backend: он не смог выполнить запрос к базе. В режиме разработки рядом с сообщением выводится причина (например `relation "events" does not exist`), точный стек — в терминале, где запущен backend. Проверьте `npm run db:local:doctor`: нет таблиц → `npm run db:migrate`; база не запущена → `npm run db:local`. Если в `backend/.env` остался старый `DATABASE_URL` (например от прежней облачной базы), database берётся оттуда — уберите эту переменную, чтобы работать с локальной БД. |
| Логин не проходит, хотя пароль «верный» | Пароль администратора создаётся один раз и не перезаписывается. Посмотрите список и задайте новый: `npm run admin:list`, затем `npm run admin:reset -- --email=admin@dsu.local --password=НовыйПароль123`. Значения `ADMIN_EMAIL`/`ADMIN_PASSWORD` из `backend/.env` не меняют уже существующий пароль. |
| Просит вход, хотя вы уже входили | Сессия хранится 8 часов (`JWT_EXPIRES_IN`) плюс cookie; после перезапуска backend с новым `JWT_SECRET` токен становится недействительным. Войдите заново. |
| `Порт 55432 занят, но подключиться ... не получается` | На этом порту другой PostgreSQL. Задайте `LOCAL_DB_PORT=55433` в `backend/.env` (и пересоберите фронтенд, если меняете порт API `PORT`). |
| `initdb не выдал ни одной строки вывода` (Windows) | Не хватает библиотек Microsoft Visual C++ или запуск блокирует защитник. Установите [Microsoft Visual C++ Redistributable 2015–2022 (x64)](https://aka.ms/vs/17/release/vc_redist.x64.exe), разрешите `postgres.exe` в защитнике Windows (в т.ч. «Smart App Control»), либо укажите `LOCAL_DB_BIN_DIR` на установленный PostgreSQL. |
| Ошибки вида «directory is not empty» / странные падения initdb | Путь к проекту содержит кириллицу или пробелы. Задайте `LOCAL_DB_DIR=C:\dsu-localdb`. |
| `Database connection is not configured` | Стоит `LOCAL_DATABASE=false`, но внешняя БД не задана. Уберите эту переменную или укажите `DATABASE_URL`/`DB_HOST`. |
| Сайт открылся, но «нет данных» / красная плашка | Backend не запущен или запущен на другом порту. Проверьте `http://127.0.0.1:4000/api/health/ready` и адреса в `.env.live-server`. |
| Ошибка CORS в консоли браузера | Live Server работает на порту, которого нет в списке (например 5505). Перезапустите Live Server (закрепите `liveServer.settings.port` = 5500) или добавьте источник в `CORS_ORIGIN`. |
| Запросы к API уходят «в никуда» | Front-end собран без `npm run build:live` (относительный `/api` работает только с прокси Vite). Пересоберите: `npm run build:live`. |
| Порт 4000 занят | Закройте предыдущий backend или задайте другой `PORT` в `backend/.env` и пересоберите фронтенд с новым `VITE_API_URL`/`VITE_SOCKET_URL`. |
| После Ctrl+C остался `postgres.exe` | Он был запущен отдельно (`npm run db:local`). Остановите: `npm run db:local:stop`. |

## Что именно создаётся на компьютере

| Путь | Что это | Как удалить |
| --- | --- | --- |
| `backend/node_modules/@embedded-postgres/*` | бинарники PostgreSQL (скачаны npm) | `rm -rf backend/node_modules` |
| `backend/.localdb/` | кластер с вашими данными и логи | удалить папку (данные пропадут) |
| `dist/` | собранный фронтенд для Live Server | удалить папку, пересобрать `npm run build:live` |
| `backend/.env` | ваши локальные настройки | удалить файл |

Ничего не устанавливается в системные каталоги, не регистрируется служб и не
добавляется в автозагрузку.

## Переменные окружения

Настройки backend (файл `backend/.env`, образец — `backend/.env.example`):

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `LOCAL_DATABASE` | `auto` | `false` — не запускать встроенный PostgreSQL |
| `LOCAL_DB_DIR` | `backend/.localdb` | каталог кластера, логов и временных файлов |
| `LOCAL_DB_PORT` | `55432` | порт локального сервера |
| `LOCAL_DB_USER` / `LOCAL_DB_PASSWORD` | `postgres` / `postgres` | суперпользователь локального кластера |
| `LOCAL_DB_NAME` | `dsu_debate` | имя базы приложения |
| `LOCAL_DB_BIN_DIR` | — | каталог `bin` установленного PostgreSQL (вместо скачанных бинарников) |
| `LOCAL_DB_TIMEOUT_MS` | `120000` | сколько ждать инициализацию/запуск |
| `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | — | внешняя БД: при задании встроенная не запускается |
| `DB_SSLMODE` | `disable` для localhost | `disable\|allow\|prefer\|require\|verify-ca\|verify-full` |
| `PORT` | `4000` | порт API |
| `JWT_SECRET` | `dev-only-secret` (в dev) | секрет сессий админа; в production обязателен свой ≥ 32 символов |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@dsu.local` / `ChangeMe123!` (в dev) | локальный администратор |
| `CORS_ORIGIN` | Live Server 5500–5503, Vite 5173–5174, preview 4173 | список источников или `*` |
| `TRUST_PROXY` | `0` | число хопов, если API стоит за прокси |
| `COOKIE_SECURE` | `false` | `true` при работе только по HTTPS |

Настройки фронтенда (корневой `.env`, образцы — `.env.example` и
`.env.live-server`):

| Переменная | Назначение |
| --- | --- |
| `VITE_API_URL` | адрес API: `/api` (через прокси) или `http://127.0.0.1:4000/api` |
| `VITE_SOCKET_URL` | адрес Socket.io; пусто = тот же хост, что и страница |
| `VITE_BACKEND_URL` | куда dev-сервер/предпросмотр проксирует запросы |
| `VITE_USE_MOCKS` | `true` — демо-режим без backend (данные из `src/mock`) |

## Полезные ссылки

- REST и Socket.io контракт: [API_SPEC.md](API_SPEC.md)
- Приватность и обработка данных: [PRIVACY.md](PRIVACY.md)
- Backend подробнее: [../backend/README.md](../backend/README.md)
