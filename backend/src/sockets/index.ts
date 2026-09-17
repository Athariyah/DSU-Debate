import type { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { env } from "../config/env";
import { isSocketOriginAllowed } from "../config/cors";
import { EventResults } from "../types";

let ioInstance: Server | null = null;

/**
 * Возвращает имя комнаты Socket.io для конкретного дебата.
 * Все клиенты, смотрящие один и тот же дебат, находятся в одной комнате,
 * поэтому обновления результатов рассылаются им одним broadcast'ом.
 */
export function debateRoom(eventId: number): string {
  return `debate:${eventId}`;
}

/**
 * Инициализация Socket.io сервера поверх уже созданного http.Server.
 * Вызывается один раз при старте приложения (см. server.ts).
 */
export function initSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    transports: ["websocket"],
    pingInterval: 25000,
    pingTimeout: 20000,
    cors: {
      // Та же политика, что и у REST-API (см. config/cors.ts): при локальном
      // хостинге по умолчанию разрешены любые источники, чтобы Live Server,
      // локальный IP, туннели и превью-домены работали без настройки.
      origin: env.corsAllowAll ? true : env.corsOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    // Отдельная проверка для WebSocket-транспорта: CORS-заголовки его не
    // защищают, поэтому источник проверяем вручную.
    allowRequest: isSocketOriginAllowed,
  });

  io.on("connection", (socket: Socket) => {
    // eslint-disable-next-line no-console
    console.log(`[socket.io] client connected: ${socket.id}`);

    // Клиент подписывается на конкретный дебат, чтобы получать live-обновления
    socket.on("join_debate", (eventId: number) => {
      if (typeof eventId !== "number" || !Number.isInteger(eventId)) {
        return;
      }
      socket.join(debateRoom(eventId));
      // eslint-disable-next-line no-console
      console.log(`[socket.io] ${socket.id} joined ${debateRoom(eventId)}`);
    });

    socket.on("leave_debate", (eventId: number) => {
      if (typeof eventId !== "number" || !Number.isInteger(eventId)) {
        return;
      }
      socket.leave(debateRoom(eventId));
    });

    socket.on("disconnect", (reason: string) => {
      // eslint-disable-next-line no-console
      console.log(`[socket.io] client disconnected: ${socket.id} (${reason})`);
    });
  });

  ioInstance = io;
  return io;
}

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error(
      "Socket.io server has not been initialized yet. Call initSocketServer() first."
    );
  }
  return ioInstance;
}

/**
 * Транслирует свежие результаты голосования всем клиентам, подписанным
 * на комнату конкретного дебата.
 */
export function broadcastVoteUpdate(results: EventResults): void {
  const io = getIO();
  io.to(debateRoom(results.eventId)).emit("vote:update", results);
}

/**
 * Транслирует смену статуса мероприятия (например upcoming -> active).
 */
export function broadcastEventStatusChanged(
  eventId: number,
  status: string
): void {
  const io = getIO();
  io.to(debateRoom(eventId)).emit("event:status_changed", { eventId, status });
}

/**
 * Транслирует переключение флажка «Скрыть голоса»: клиенты сразу прячут
 * цифры или мгновенно раскрывают итоги без перезагрузки страницы.
 */
export function broadcastVoteVisibilityChanged(
  eventId: number,
  votesHidden: boolean
): void {
  const io = getIO();
  io.to(debateRoom(eventId)).emit("event:votes_visibility", { eventId, votesHidden });
}

/**
 * Транслирует переключение флажка «Скрыть от публики»: открытые страницы
 * дебата у обычных пользователей мгновенно показывают «дебат скрыт» (или,
 * при раскрытии, подгружают данные заново).
 */
export function broadcastPublicVisibilityChanged(
  eventId: number,
  hiddenFromPublic: boolean
): void {
  const io = getIO();
  io.to(debateRoom(eventId)).emit("event:public_visibility", { eventId, hiddenFromPublic });
}

export function broadcastMatchUpdate(eventId: number, match: unknown): void {
  const io = getIO();
  io.to(debateRoom(eventId)).emit("match:update", { eventId, match });
}

export function broadcastStandingsUpdate(eventId: number, standings: unknown): void {
  const io = getIO();
  io.to(debateRoom(eventId)).emit("standings:update", { eventId, standings });
}

export function broadcastLeaderboardUpdate(eventId: number, leaderboard: unknown): void {
  const io = getIO();
  io.to(debateRoom(eventId)).emit("leaderboard:update", { eventId, leaderboard });
}

export function broadcastPodiumUpdate(eventId: number, podium: unknown): void {
  const io = getIO();
  io.to(debateRoom(eventId)).emit("podium:update", { eventId, podium });
}
