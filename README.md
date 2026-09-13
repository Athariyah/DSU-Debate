# DSU Debate

Платформа live-голосований на дебатах.

## Локальный запуск полного стека

Требуется Node.js 20+ и Docker с Compose.

### 1. PostgreSQL

```bash
docker compose up -d db
```

### 2. Backend

```bash
cp backend/.env.example backend/.env
cd backend
npm ci
npm run dev
```

Backend будет доступен на `http://localhost:4000`. При первом запуске с настройками
из `backend/.env.example` автоматически создаётся локальный администратор:

```text
Email:    admin@dsu.local
Пароль:   ChangeMe123!
```

### 3. Frontend

В отдельном терминале из корня:

```bash
npm ci
npm run dev
```

Vite проксирует REST `/api` и Socket.io `/socket.io` на backend. Для удалённого
backend можно задать `VITE_API_URL`, `VITE_SOCKET_URL` и `VITE_BACKEND_URL` в `.env`.

## Проверки

```bash
npm run typecheck
npm run build
cd backend && npm run typecheck && npm run build
```

## Административная сторона

Откройте раздел «Профиль» и войдите с локальными учётными данными выше либо вставьте
JWT вручную. После авторизации кнопка `+` создаёт мероприятие и всех участников в
одной транзакции.

Подробный API-контракт: `docs/API_SPEC.md`.
