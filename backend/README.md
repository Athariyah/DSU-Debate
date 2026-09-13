# DSU Debate — Backend (Express + Socket.io + PostgreSQL)

Отдельный микросервис, реализующий REST API и real-time трансляцию результатов
голосования для платформы "DSU Debate".

## Стек
- Node.js + TypeScript + Express
- PostgreSQL (`pg`, без ORM — чистый SQL, транзакции через `pg.Pool`)
- Socket.io для realtime broadcast результатов голосования
- JWT (`jsonwebtoken`) для авторизации администратора, `bcrypt` для хэширования паролей
- `zod` для валидации входных данных

## Структура
```
backend/
  src/
    config/       # env, пул подключения к PostgreSQL, транзакции
    controllers/   # auth, events, participants, vote
    middleware/    # JWT auth guard, error handler, async wrapper
    routes/        # маршруты admin/* и публичные events/*
    sockets/       # инициализация Socket.io, broadcast helpers
    types/         # общие TS-типы моделей
    validation/    # zod-схемы валидации запросов
    app.ts         # сборка Express-приложения
    server.ts      # http.Server + Socket.io + graceful shutdown
```

## Схема БД
DDL находится в `../sql/schema.sql` (4 таблицы: admins, events, participants, votes).
Применить к базе:
```bash
psql "$DATABASE_URL" -f ../sql/schema.sql
```

## Запуск
```bash
cd backend
npm install
cp .env .env.local   # при необходимости поправить значения
npm run dev           # разработка (ts-node-dev, hot reload)
npm run build && npm start   # production
```

Переменные окружения (`.env`):
- `DATABASE_URL` — строка подключения к PostgreSQL
- `PORT` — порт HTTP/WebSocket сервера (по умолчанию 4000)
- `JWT_SECRET`, `JWT_EXPIRES_IN` — параметры подписи токена администратора
- `CORS_ORIGIN` — разрешённый origin для фронтенда и Socket.io

## API
Полная спецификация эндпоинтов — в `../docs/API_SPEC.md`.

## Anti-fraud
Голос зрителя защищён двумя рубежами:
1. Явная проверка в контроллере `POST /api/events/:id/vote` перед вставкой —
   ищем существующую запись с тем же `event_id` и (`device_fingerprint` ИЛИ `ip_address`).
2. `UNIQUE` constraints в БД (`uq_votes_event_fingerprint`, `uq_votes_event_ip`) —
   финальный барьер на случай гонки при одновременных запросах.

Вся операция (проверка + вставка + пересчёт процентов) выполняется в единой
транзакции PostgreSQL с блокировкой строки мероприятия (`SELECT ... FOR UPDATE`),
что исключает рассинхронизацию счётчиков при высокой конкурентной нагрузке.
