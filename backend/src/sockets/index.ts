import type { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { env } from "../config/env";
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
    cors: {
      origin: env.corsOrigin === "*" ? true : env.corsOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
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
