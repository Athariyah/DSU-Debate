import type { VoteUpdatePayload } from "../types";

type Listener = (payload: VoteUpdatePayload) => void;
const listeners = new Map<number, Set<Listener>>();

export function mockSubscribe(eventId: number, cb: Listener) {
  if (!listeners.has(eventId)) listeners.set(eventId, new Set());
  listeners.get(eventId)!.add(cb);
  return () => listeners.get(eventId)?.delete(cb);
}

export function mockPublish(payload: VoteUpdatePayload) {
  listeners.get(payload.eventId)?.forEach((cb) => cb(payload));
}
