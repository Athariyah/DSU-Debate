# DSU Debate — REST и Socket.io контракт

Все URL ниже указаны относительно `/api`. Формат запросов и ответов — JSON.
Время передаётся в ISO-8601 с timezone.

> За Yandex Cloud CDN методы `POST`/`PUT`/`PATCH`/`DELETE` уходят по сети как
> `GET` с параметрами `_method`/`_body`/`_token`/`_t` (CDN режет мутации с 405),
> backend восстанавливает исходный запрос раньше роутера — логический контракт
> ниже от этого не меняется. Детали — [CDN_COMPATIBILITY.md](CDN_COMPATIBILITY.md).

## Health

- `GET /health/live` — проверяет, что процесс backend запущен.
- `GET /health/ready` — проверяет подключение к PostgreSQL.
- `GET /health` — совместимый readiness endpoint.

## Авторизация администратора

### `POST /admin/auth/register`

В production требует заголовок `X-Admin-Registration-Key`, совпадающий с
`ADMIN_REGISTRATION_KEY`. В development также может быть включена переменной
`ALLOW_ADMIN_REGISTRATION=true`.

```json
{ "email": "admin@example.com", "password": "StrongPassword123" }
```

### `POST /admin/auth/login`

```json
{ "email": "admin@example.com", "password": "StrongPassword123" }
```

Успешный ответ содержит JWT и устанавливает HttpOnly cookie `dsu_admin_token`.
Для ручных API-клиентов можно использовать:

```text
Authorization: Bearer <token>
```

### `GET /admin/auth/me`

Проверяет текущую сессию администратора.

### `POST /admin/auth/logout`

Очищает HttpOnly cookie.

## Публичные дебаты

### `GET /events/active`

Возвращает активный дебат или `404 NO_ACTIVE_EVENT`.

### `GET /events/upcoming`

Возвращает массив предстоящих дебатов.

### `GET /events/history?page=1&limit=20`

Возвращает страницу завершённых дебатов:

```json
{ "items": [], "total": 0, "page": 1, "limit": 20 }
```

### `GET /events/:id`

Возвращает дебат с участниками и текущими результатами.

Формат успешного ответа активного, предстоящего или завершённого дебата:

```json
{
  "event": {
    "id": 5,
    "title": "ИИ: угроза или возможность?",
    "status": "active",
    "dateTime": "2026-09-14T16:00:00.000Z",
    "votingDurationMinutes": 60,
    "votingEndsAt": "2026-09-14T17:00:00.000Z",
    "votesHidden": false,
    "participantsCount": 2
  },
  "participants": [
    {
      "id": 11,
      "eventId": 5,
      "name": "Алексей Петров",
      "description": "Сторонник ограничений",
      "votesCount": 42,
      "percentage": 42
    }
  ],
  "totalVotes": 100
}
```

`votingDurationMinutes` — длительность голосования в минутах после начала дебата
(или `null`, если таймер не задан). `votingEndsAt` — ISO-дедлайн, равный
`dateTime + votingDurationMinutes` (или `null`). Та же пара полей есть в
ответах `GET /events/active`, `GET /events/upcoming`, `GET /events/history`
и в админских списках/карточках мероприятий.

`votesHidden` — закрытое голосование (флажок «Скрыть голоса» в админке). Пока
флаг `true`, сервер **зануляет** `votesCount`, `percentage` и `totalVotes` во
всех публичных ответах (участники, их имена и описания остаются видимыми),
поэтому расклад нельзя подсмотреть даже через API. Административные маршруты
(`/admin/events*`) всегда отдают настоящие цифры.

`hiddenFromPublic` — флажок «Скрыть от публики» (задаётся в админке и при
создании дебата). Пока флаг `true`, дебат **отсутствует во всех публичных
ответах**: списки `upcoming`/`history`/`active` его не содержат, `GET
/events/:id` и `POST /events/:id/vote` отвечают `404 EVENT_NOT_FOUND`, как
если бы дебата не было. Административные маршруты (`/admin/events*`)
по-прежнему отдают дебат вместе с флагом.

### `POST /events/:id/vote`

Тело запроса:

```json
{
  "participantId": 11,
  "voterName": "Иван Иванов",
  "deviceFingerprint": "b6f1a6b2-8e2b-4a90-9a2a-7a6f0e0a1234"
}
```

`deviceFingerprint` должен быть UUID v4. Backend определяет IP через Express с
учётом только настроенного количества доверенных прокси, проверяет уникальность
голоса и выполняет вставку с пересчётом результатов в одной транзакции.

Ошибки:

- `404 EVENT_NOT_FOUND` / `404 PARTICIPANT_NOT_FOUND` — неверные id;
- `409 EVENT_NOT_ACTIVE` — событие не в статусе `active`;
- `409 DUPLICATE_VOTE` — голос уже учтён (по устройству и IP);
- `409 VOTING_CLOSED` — задан таймер голосования и дедлайн `votingEndsAt`
  уже прошёл (даже если фоновый обработчик ещё не успел перевести событие
  в `completed`).

Запросы голосования дополнительно ограничиваются rate limit.

## Административные мероприятия

Все маршруты ниже требуют Bearer JWT или HttpOnly auth cookie.

### `POST /admin/events`

Создаёт мероприятие и, если переданы участники, сохраняет их атомарно вместе с ним:

```json
{
  "title": "ИИ: угроза или возможность?",
  "dateTime": "2026-09-14T16:00:00.000Z",
  "status": "upcoming",
  "votingDurationMinutes": 60,
  "participants": [
    { "name": "Алексей Петров", "description": "За ограничения" },
    { "name": "Мария Иванова", "description": "Против ограничений" }
  ]
}
```

`votingDurationMinutes` — необязательное поле, целое от 1 до 1440; `null`
или отсутствие — таймер выключен.

### `GET /admin/events`

Список мероприятий. Поддерживает `page`, `limit` и фильтр `status`.

### `GET /admin/events/:id`, `PUT /admin/events/:id`, `DELETE /admin/events/:id`

CRUD отдельного мероприятия. При переводе в `active` backend проверяет минимум двух
участников и автоматически завершает предыдущий active event.

`PUT` также принимает `votesHidden` (boolean) — флажок «Скрыть голоса».
При фактическом переключении подписчикам дебата сначала уходит `vote:update`
с актуальными результатами (занулёнными при скрытии, настоящими при раскрытии),
затем событие `event:votes_visibility` — большие экраны раскрывают итоги
мгновенно, без перезагрузки.

`PUT` также принимает `hiddenFromPublic` (boolean) — флажок «Скрыть от
публики» (см. выше). `POST /admin/events` тоже принимает `hiddenFromPublic`
(по умолчанию `false`). При фактическом переключении подписчикам дебата
уходит событие `event:public_visibility` — открытые страницы обычных
пользователей мгновенно укрываются заглушкой «Дебат скрыт организатором».

Таймер голосования: `PUT` принимает `votingDurationMinutes` (1–1440) и
явно переданное `null` (сброс). У активного события с истёкшим таймером
(`dateTime + длительность <= now`) фоновый обработчик раз в 15 секунд
автоматически ставит `status = 'completed'` и рассылает `event:status_changed`;
до момента срабатывания обработчика голос принимается, но отклоняется
защитой `409 VOTING_CLOSED`.

### `/admin/participants`

CRUD участников с проверкой существования мероприятия и лимитом до трёх участников.
Удаление участника каскадно удаляет его голоса; удалить одного из двух участников
активного дебата нельзя (ответ `409 ACTIVE_EVENT_MIN_PARTICIPANTS`).

## Socket.io

Frontend подключается к тому же origin (`npm run dev` и `npm run serve:local`
проксируют `/socket.io` на backend) либо к адресу из `VITE_SOCKET_URL` — это
вариант VS Code Live Server, где запрос идёт напрямую на
`http://127.0.0.1:4000` и backend разрешает источник через CORS.

Клиент → сервер:

- `join_debate(eventId: number)`
- `leave_debate(eventId: number)`

Сервер → клиент:

- `vote:update` — `{ eventId, totalVotes, participants }` после успешного голоса.
  При включённом `votesHidden` цифры в payload занулены (закрытое голосование);
- `event:status_changed` — `{ eventId, status }` после изменения статуса дебата
  (включая автоматический перевод в `completed` по таймеру голосования);
- `event:votes_visibility` — `{ eventId, votesHidden }` после переключения
  флажка «Скрыть голоса» в админке; перед ним уходит `vote:update` с
  актуальными (или занулёнными) результатами;
- `event:public_visibility` — `{ eventId, hiddenFromPublic }` после
  переключения флажка «Скрыть от публики» в админке.

Экран трансляции `/broadcast/:id` (большие экраны) подписывается на те же два
события через `join_debate` и обновляет голоса, проценты и статус без
перезагрузки. Если realtime-канал не поднимается, экран раз в 5 секунд
перечитывает `GET /events/:id`, поэтому трансляция не «застывает».
