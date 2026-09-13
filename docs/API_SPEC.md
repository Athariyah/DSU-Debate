# DSU Debate — REST и Socket.io контракт

Все URL ниже указаны относительно `/api`. Формат запросов и ответов — JSON.
Время передаётся в ISO-8601 с timezone.

## Авторизация администратора

### `POST /admin/auth/register`

```json
{ "email": "admin@example.com", "password": "StrongPassword123" }
```

### `POST /admin/auth/login`

```json
{ "email": "admin@example.com", "password": "StrongPassword123" }
```

Успешный ответ содержит `token`. Для защищённых запросов используйте:

```text
Authorization: Bearer <token>
```

## Публичные дебаты

### `GET /events/active`

Возвращает активный дебат или `404 NO_ACTIVE_EVENT`.

### `GET /events/upcoming`

Возвращает массив предстоящих дебатов.

### `GET /events/:id`

Возвращает дебат с участниками и текущими результатами.

Формат всех трёх успешных ответов:

```json
{
  "event": {
    "id": 5,
    "title": "ИИ: угроза или возможность?",
    "status": "active",
    "dateTime": "2026-09-14T16:00:00.000Z",
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

### `POST /events/:id/vote`

Тело запроса:

```json
{
  "participantId": 11,
  "voterName": "Иван Иванов",
  "deviceFingerprint": "b6f1a6b2-8e2b-4a90-9a2a-7a6f0e0a1234"
}
```

`deviceFingerprint` должен быть UUID v4. Backend дополнительно определяет IP,
проверяет уникальность голоса по fingerprint или IP и выполняет вставку с пересчётом
результатов в одной транзакции.

Успешный ответ:

```json
{
  "success": true,
  "vote": { "id": 981, "participantId": 11, "createdAt": "2026-09-14T16:05:00.000Z" },
  "results": {
    "eventId": 5,
    "totalVotes": 101,
    "participants": []
  }
}
```

Повторный голос возвращает `409 DUPLICATE_VOTE`.

## Административные мероприятия

Все маршруты ниже требуют Bearer JWT.

### `POST /admin/events`

Создаёт мероприятие и, если переданы участники, сохраняет их атомарно вместе с ним:

```json
{
  "title": "ИИ: угроза или возможность?",
  "dateTime": "2026-09-14T16:00:00.000Z",
  "status": "upcoming",
  "participants": [
    { "name": "Алексей Петров", "description": "За ограничения" },
    { "name": "Мария Иванова", "description": "Против ограничений" }
  ]
}
```

### `GET /admin/events`

Список мероприятий. Поддерживает `page`, `limit` и `status`.

### `GET /admin/events/:id`, `PUT /admin/events/:id`, `DELETE /admin/events/:id`

CRUD отдельного мероприятия.

### `/admin/participants`

CRUD участников. `POST /admin/participants` принимает `eventId`, `name` и
`description`. Отдельные операции нужны для административного редактирования;
создание через frontend выполняется атомарно через `POST /admin/events`.

## Socket.io

Frontend подключается к тому же origin (Vite проксирует `/socket.io`) либо к
`VITE_SOCKET_URL`.

Клиент → сервер:

- `join_debate(eventId: number)`
- `leave_debate(eventId: number)`

Сервер → клиент:

- `vote:update` — `{ eventId, totalVotes, participants }` после успешного голоса;
- `event:status_changed` — `{ eventId, status }` после изменения статуса администратором.
