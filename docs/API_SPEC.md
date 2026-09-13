# DSU Debate — REST API Спецификация

Базовый URL (пример): `http://localhost:4000`
Формат тела запросов/ответов: `application/json`
Все даты в формате ISO-8601 (UTC), `date_time` передаётся/возвращается как `TIMESTAMPTZ`.

Аутентификация администратора — `JWT` (Bearer token). Аутентификация зрителя —
бесшовная, без пароля: клиент сам генерирует `device_fingerprint` (UUID v4) один раз
и хранит его в `localStorage`, дальше передаёт с каждым запросом на голосование.

---

## 1. Администратор — регистрация и вход

### POST /api/admin/auth/register
Регистрация нового администратора.

**Headers:** `Content-Type: application/json`

**Body:**
```json
{
  "email": "admin@dsu-debate.com",
  "password": "StrongPassword123"
}
```

**Success 201:**
```json
{
  "admin": { "id": 1, "email": "admin@dsu-debate.com", "createdAt": "2026-01-10T10:00:00.000Z" },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "8h"
}
```

**Errors:**
- `400` — невалидный email / пароль короче 8 символов
- `409` — email уже зарегистрирован

---

### POST /api/admin/auth/login
Вход администратора.

**Body:**
```json
{ "email": "admin@dsu-debate.com", "password": "StrongPassword123" }
```

**Success 200:**
```json
{
  "admin": { "id": 1, "email": "admin@dsu-debate.com" },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": "8h"
}
```

**Errors:** `400` — не переданы поля, `401` — неверный email/пароль

---

## 2. CRUD /api/admin/events (требует `Authorization: Bearer <token>`)

### POST /api/admin/events
Создать мероприятие.
**Body:**
```json
{ "title": "ИИ: угроза или возможность?", "dateTime": "2026-02-12T14:00:00.000Z", "status": "upcoming" }
```
**Success 201:** созданный объект `event`.
Если `status = "active"` — сервис в транзакции переводит предыдущий активный дебат в `completed`
(поддерживается инвариант «один активный дебат одновременно», также закреплён partial unique index в БД).

### GET /api/admin/events
Список всех мероприятий (с пагинацией `?page=1&limit=20` и фильтром `?status=active`).
**Success 200:**
```json
{ "items": [ { "id": 5, "title": "...", "status": "active", "dateTime": "...", "createdBy": 1, "participantsCount": 3 } ], "total": 12 }
```

### GET /api/admin/events/:id
Детали мероприятия + список участников + текущая статистика голосов.

### PUT /api/admin/events/:id
Обновить `title`, `dateTime`, `status`.

### DELETE /api/admin/events/:id
Удалить мероприятие (каскадно удаляются участники и голоса — `ON DELETE CASCADE`).

**Общие ошибки для всех CRUD /admin/*:** `401` — токен отсутствует/невалиден,
`403` — токен валиден, но не относится к администратору, `404` — мероприятие не найдено.

---

## 3. CRUD /api/admin/participants (требует JWT)

### POST /api/admin/participants
```json
{ "eventId": 5, "name": "Алексей Петров", "description": "Сторонник ограничений" }
```
**Success 201:** созданный `participant`.

### GET /api/admin/participants?eventId=5
Список участников мероприятия.

### GET /api/admin/participants/:id
### PUT /api/admin/participants/:id
```json
{ "name": "Алексей Петров", "description": "Обновлённое описание" }
```
### DELETE /api/admin/participants/:id
Удаляет участника (каскадно удаляются его голоса).

---

## 4. Публичные эндпоинты зрителя (без JWT)

### GET /api/events/active
Получить текущий активный дебат вместе с участниками и live-результатами.

**Success 200:**
```json
{
  "event": { "id": 5, "title": "Роль социальных сетей...", "status": "active", "dateTime": "2026-01-10T16:00:00.000Z" },
  "participants": [
    { "id": 11, "name": "Алексей Петров", "description": "Сторонник ограничений", "votesCount": 42, "percentage": 42.0 },
    { "id": 12, "name": "Мария Иванова", "description": "За свободное использование", "votesCount": 35, "percentage": 35.0 },
    { "id": 13, "name": "Даниил Соколов", "description": "Против ограничений", "votesCount": 23, "percentage": 23.0 }
  ],
  "totalVotes": 100
}
```
**Errors:** `404` — сейчас нет активного дебата.

Клиент дополнительно подключается к Socket.io комнате `debate:<eventId>`, чтобы получать
обновления `vote:update` в реальном времени без повторных HTTP-запросов.

---

### POST /api/events/:id/vote
Отдать голос за участника дебата `:id`.

**Headers:** `Content-Type: application/json`
(fingerprint передаётся в теле; IP берётся сервером из соединения/`X-Forwarded-For`)

**Body:**
```json
{
  "participantId": 11,
  "voterName": "Гость",
  "deviceFingerprint": "b6f1a6b2-8e2b-4a90-9a2a-7a6f0e0a1234"
}
```

**Success 201:**
```json
{
  "success": true,
  "vote": { "id": 981, "participantId": 11, "createdAt": "2026-01-10T16:05:00.000Z" },
  "results": {
    "eventId": 5,
    "totalVotes": 101,
    "participants": [
      { "participantId": 11, "name": "Алексей Петров", "votesCount": 43, "percentage": 42.6 },
      { "participantId": 12, "name": "Мария Иванова", "votesCount": 35, "percentage": 34.7 },
      { "participantId": 13, "name": "Даниил Соколов", "votesCount": 23, "percentage": 22.8 }
    ]
  }
}
```
Тот же объект `results` рассылается всем клиентам в комнате `debate:5` через событие сокета `vote:update`.

**Errors:**
- `400` — отсутствует/невалиден `deviceFingerprint` (должен быть UUID) или `participantId`
- `404` — мероприятие или участник не найден
- `409` — мероприятие не активно (`status !== 'active'`)
- `409` — **Anti-fraud**: голос с этого `device_fingerprint` или `ip_address` в рамках этого `event_id` уже зарегистрирован
  ```json
  { "success": false, "code": "DUPLICATE_VOTE", "message": "Вы уже голосовали в этом дебате" }
  ```

---

## 5. WebSocket (Socket.io) контракт

**Подключение:** `io("http://localhost:4000")`

**Клиент → сервер:**
- `join_debate` `(eventId: number)` — подписка на комнату `debate:<eventId>`
- `leave_debate` `(eventId: number)` — отписка

**Сервер → клиент:**
- `vote:update` `{ eventId, totalVotes, participants: [{ participantId, name, votesCount, percentage }] }`
  — рассылается всем в комнате сразу после успешной записи голоса в транзакции.
- `event:status_changed` `{ eventId, status }` — опционально, при смене статуса дебата администратором.
