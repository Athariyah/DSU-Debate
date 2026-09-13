import type { VoteUpdatePayload } from "../types";

/**
 * Локальный pub/sub, эмулирующий Socket.io-комнату дебата
 * (`join_debate` / `vote_update`) на случай, если бэкенд ещё не поднят.
 * Как только появится живой сервер, useDebateSocket начнёт использовать
 * настоящий socket.io-client и этот файл перестанет вызываться.
 */
type Listener = (payload: VoteUpdatePayload) => void;

const listeners = new Map<string, Set<Listener>>();

export function mockSubscribe(eventId: string, cb: Listener) {
  if (!listeners.has(eventId)) listeners.set(eventId, new Set());
  listeners.get(eventId)!.add(cb);
  return () => listeners.get(eventId)?.delete(cb);
}

export function mockPublish(payload: VoteUpdatePayload) {
  listeners.get(payload.eventId)?.forEach((cb) => cb(payload));
}
