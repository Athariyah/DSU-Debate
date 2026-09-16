# DSU Debate

Платформа live-голосований на дебатах: зрители голосуют со своих телефонов,
результаты обновляются в реальном времени.

Приложение рассчитано на **локальный хостинг на своём компьютере**:

- фронтенд (React + Vite + Tailwind) раздаётся через **VS Code Live Server**;
- backend (Express + Socket.io) запускается обычным Node.js процессом;
- **PostgreSQL приложение поднимает само** — отдельный кластер в `backend/.localdb`,
  без установки PostgreSQL в систему, без Docker и облаков.

Полное руководство (Windows, VS Code, порты, бэкапы, телефоны в Wi-Fi,
диагностика): **[docs/LOCAL_HOSTING.md](docs/LOCAL_HOSTING.md)**.

> Нужно выложить сайт в интернет (свой домен, HTTPS, доступ с любого телефона)?
> Смотрите **[docs/VPS_DEPLOY.md](docs/VPS_DEPLOY.md)**: в `deploy/` лежат
> готовые Caddyfile, systemd-юнит и скрипт, который ставит Node, PostgreSQL и
> Caddy на VPS одной командой.

## Быстрый старт

Нужны только Node.js 18+ и расширение Live Server в VS Code
(интернет — лишь на время `npm install`, чтобы скачать бинарники PostgreSQL).

**1. Backend + локальная база** (первый терминал, оставить открытым):

```bash
cd backend
npm install
npm run dev
```

Первый запуск создаёт кластер PostgreSQL в `backend/.localdb`, базу
`dsu_debate`, применяет миграции и создаёт администратора
`admin@dsu.local` / `ChangeMe123!`.

Проверка: <http://127.0.0.1:4000/api/health/ready> → `{"status":"ready","database":"ok"}`.

**2. Сборка фронтенда** (второй терминал, из корня проекта):

```bash
npm install
npm run build:live
```

**3. Хостинг через Live Server**

В VS Code: правый клик по `dist/index.html` → **Open with Live Server** →
<http://127.0.0.1:5500/dist/index.html>.

> Изменения в `src` требуют повторного `npm run build:live`. Для разработки с
> горячей перезагрузкой есть `npm run dev` (Vite на
> <http://localhost:5173> с проксированием API) — см. `docs/LOCAL_HOSTING.md`.

## Команды

| Команда (корень проекта) | Что делает |
| --- | --- |
| `npm run build:live` | сборка `dist/index.html` для Live Server (абсолютные адреса API) |
| `npm run dev` | Vite dev-сервер с прокси на backend (режим разработки) |
| `npm run serve:local` | сборка + `vite preview` на `127.0.0.1:4173` с прокси |
| `npm run backend` | backend + локальная БД (то же, что `npm run dev` в `backend`) |
| `npm run db` / `npm run db:stop` | запустить / остановить локальную БД |
| `npm run typecheck`, `npm run test`, `npm run build` | проверки фронтенда |

| Команда (папка `backend`) | Что делает |
| --- | --- |
| `npm run dev` | backend на `:4000`; при необходимости поднимает PostgreSQL |
| `npm run db:local` | запустить локальную БД в фоне (создаётся при первом запуске) |
| `npm run db:local:stop` | остановить локальную БД (данные сохраняются) |
| `npm run db:local:status` | состояние: порт, версия, размер данных, логи |
| `npm run db:local:doctor` | диагностика окружения и базы |
| `npm run db:local:logs` | лог PostgreSQL |
| `npm run admin:list` | список администраторов |
| `npm run admin:reset -- --email=... --password=...` | сменить пароль администратора |
| `npm run db:check` | к какой БД реально подключается приложение |
| `npm run db:migrate` | применить миграции вручную |
| `npm run typecheck`, `npm run test`, `npm run build` | проверки backend |

## Возможности

- анонимное голосование зрителей с anti-fraud (UUID устройства + IP);
- транзакции PostgreSQL и ограничения целостности;
- JWT-аутентификация администратора (HttpOnly cookie + Bearer-токен);
- защищённый маршрут `/admin` во фронтенде;
- CRUD дебатов и участников, статусы `upcoming` → `active` → `completed`;
- история завершённых дебатов с постраничной выдачей;
- live-обновления результатов и статусов через Socket.io;
- экран трансляции `/broadcast/:id` для больших экранов (телевизор, проектор):
  тема голосования, участники с позициями, голоса, проценты и статус в
  реальном времени + анимация итогов (победитель / проигравший);
- health-checks готовности;
- встроенный PostgreSQL: инициализация кластера, авто-миграции, локальный админ.

## Экран трансляции (телевизор)

Откройте страницу дебата, нажмите «три точки» → **«Трансляция на экран»** —
откроется `/broadcast/:id` на всю площадь окна браузера (без телефонной
обёртки). Этот же адрес можно открыть в браузере телевизора или проектора.

На экране в реальном времени обновляются:

- количество голосов и процент по каждому участнику (анимированные числа и
  полосы, чип «Лидер» у того, кто впереди);
- суммарное число голосов и часы;
- статус голосования: «В эфире» → «Завершено»;
- состояние realtime-канала (если сокет недоступен, экран сам перечитывает
  результаты по REST каждые 5 секунд).

Когда статус становится `completed`, проигрывается анимация итогов: победитель
(наибольший процент) и проигравший (наименьший процент), с конфетти; ничья и
отсутствие голосов показываются отдельными плашками. Кнопка «Во весь экран»
разворачивает трансляцию на весь телевизор, `Esc` — закрыть итоги или выйти.

## Структура

```
├── src/                 # React-фронтенд (Vite, Tailwind), в т.ч. broadcast/
├── backend/
│   ├── src/
│   │   ├── localdb/     # встроенный PostgreSQL: запуск, остановка, диагностика
│   │   ├── config/      # переменные окружения, пул подключений, конфиг БД
│   │   ├── controllers/ # REST-контроллеры (публичные и админские)
│   │   ├── routes/      # маршруты Express
│   │   └── sockets/     # Socket.io: комнаты дебатов, broadcast результатов
│   └── .localdb/        # данные локальной БД (в .gitignore, создаётся автоматически)
├── sql/                 # схема и миграции
├── deploy/              # публикация на VPS: Caddyfile, systemd, setup.sh
├── docs/                # LOCAL_HOSTING, VPS_DEPLOY, API_SPEC, PRIVACY
└── .vscode/             # настройки Live Server и задачи VS Code
```

## Проверки

```bash
npm run typecheck && npm run test && npm run build
cd backend && npm run typecheck && npm run test && npm run build
```

## Документация

- [docs/LOCAL_HOSTING.md](docs/LOCAL_HOSTING.md) — локальный хостинг, БД, Live Server, диагностика
- [docs/VPS_DEPLOY.md](docs/VPS_DEPLOY.md) — публикация в интернет: Caddy + Node + PostgreSQL на VPS
- [docs/API_SPEC.md](docs/API_SPEC.md) — REST и Socket.io контракт
- [docs/PRIVACY.md](docs/PRIVACY.md) — обработка данных голосующих
- [backend/README.md](backend/README.md) — backend и работа с БД
