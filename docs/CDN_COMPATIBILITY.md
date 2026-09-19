# Работа через Yandex Cloud CDN (только GET/HEAD, без WebSocket)

Продакшен (`event.mountech.online`) раздаётся через Yandex Cloud CDN — это
нужно для доступности через белые списки мобильных операторов РФ (ТСПУ).
У CDN аппаратные ограничения, под которые заточены клиент и сервер:

- разрешены только методы **`GET` и `HEAD`** (`POST`/`PUT`/`PATCH`/`DELETE` → 405);
- протокол **WebSocket глушится** (`/socket.io` недоступен извне).

Код устроен так, чтобы за CDN всё работало, а при прямом доступе к backend
(локальная разработка, `vite dev` + `backend:dev`) — тоже, без переключений.

## 1. Тоннелирование мутаций через GET

Все мутирующие вызовы (голосование, вход админа, CRUD дебатов/участников/матчей)
фронт отправляет наружу как `GET` — см. `src/api/httpClient.ts`, `apiFetch`:

```
POST /api/events/1/vote  { "participantId": 2 }
  →
GET /api/events/1/vote?_method=POST&_body=%7B%22participantId%22%3A2%7D&_t=1726778123456
```

Параметры тоннеля:

| Параметр | Назначение |
|---|---|
| `_method` | исходный метод: `POST`, `PUT`, `PATCH` или `DELETE` |
| `_body` | JSON-тело исходного запроса (URL-encoded), может отсутствовать |
| `_token` | админский JWT — дубль `Authorization: Bearer` (см. ниже) |
| `_t` | `Date.now()` против кэширования мутаций на CDN/прокси |

Backend восстанавливает запрос в `backend/src/middleware/methodTunnel.ts`
**раньше роутера**: `req.method` перезаписывается, `_body` парсится в
`req.body`, из `_token` восстанавливаются заголовки `Authorization` и
`X-Admin-Token`. Контроллеры (`router.post`, `router.put`, …) работают штатно.

Служебные параметры вычищаются из `req.url`/`req.originalUrl`, поэтому:

- чужие query-параметры (например, `?auto=true` у podium) доходят до
  контроллеров как обычно;
- токен из `_token` не утекает в журналы (`[http] …`, `[auth] …`) и в тело
  404-ответов.

Прямые (нетоннелированные) запросы тоже принимаются: локальная разработка
ходит в backend напрямую теми же вызовами `apiFetch` — методы/заголовки
дублируются, backend понимает оба варианта.

Зачем `_token` в query, если GET-запросы могут нести заголовки? Часть
промежуточных прокси (встроенные превью, корпоративные фильтры) вырезает
`Authorization`/`Cookie` — query доходит всегда. Auth-middleware
(`getBearerOrCookieToken`) принимает токен четырьмя каналами: `Authorization:
Bearer`, `X-Admin-Token`, `_token`, cookie `dsu_admin_token`.

Ограничение: тело мутации едет в URL, поэтому запросы упираются в лимит длины
строки запроса (типично 8–16 КБ). Наши тела — единицы килобайт, запаса хватает.

## 2. Запрет кэширования API

Все ответы API несут (middleware `noStoreCache`, подключён первым в `app.ts`):

```
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Pragma: no-cache
```

Живые результаты голосования отдаются только от backend, никогда из кэша CDN.
Сервис-воркер (`public/sw.js`) `/api` и `/socket.io` также не кэширует.

## 3. HEAD-запросы

Хелсчеки CDN ходят методом `HEAD`. Для `/api/health/live`, `/api/health/ready`
и `/api/health` заведены явные HEAD-обработчики: `200 OK` без тела, с той же
семантикой готовности, что и GET-версии (`ready`/`health` проверяют БД).

## 4. Realtime без WebSocket: polling-fallback

За CDN сокет не подключается, поэтому хук `src/hooks/useDebateSocket.ts`
дополнительно опрашивает `GET /api/events/:id` каждые **1.5 с**, пока нет
живого WS-соединения (обновляются голоса, проценты, статус, флажок «Скрыть
голоса»). Тики пропускаются, когда сокет жив; в демо-режиме (`VITE_USE_MOCKS`)
опрос выключен — там работает `mockSubscribe`.

Если событие пропало из публичной выдачи (404 — скрыли от публики или удалили),
хук сообщает странице через `onPublicVisibility(true)`, и та показывает
заглушку вместо устаревших цифр.

У экрана трансляции (`BroadcastPage`) поверх этого остаётся собственный
фоновый опрос раз в 5 с — он перечитывает событие целиком (включая текст для
зала и список голосований).

## 5. Требования к серверу

- **Node 20 + `better-sqlite3@11.8.0`** (запинено точно в `backend/package.json`):
  v13 требует Node ≥ 22 и роняет процесс с segfault на Node 20.
- SQLite в режиме WAL: `backend/.localdb/database.sqlite` (см. `LOCAL_HOSTING.md`).
- Backend: `npm run build` → PM2 (`pm2 start dist/server.js --name debate-backend`).
- Фронт: `vite build` → статика через Caddy (`deploy/Caddyfile`).
