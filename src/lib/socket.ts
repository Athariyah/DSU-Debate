import { io, type Socket } from "socket.io-client";

const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();
const SOCKET_URL = configuredSocketUrl || window.location.origin;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 4000,
    });
  }
  return socket;
}
