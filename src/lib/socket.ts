import { io, type Socket } from "socket.io-client";

const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? window.location.origin;

let socket: Socket | null = null;

/**
 * Синглтон Socket.io-клиента. Соответствует настройке сервера в
 * src/sockets на бэкенде: подключение по тому же origin/порту, что и
 * REST API, с JWT (для админ-панели) опционально в auth-пейлоаде.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 4000,
    });
  }
  return socket;
}
