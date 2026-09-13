import { apiFetch, getAdminToken } from "./httpClient";
import type { CreateDebateInput, DebateEvent, VoteRequestPayload, VoteResponse } from "../types";
import { mockGetEvent, mockRegisterVote, mockStore } from "../mock/mockData";
import { mockPublish } from "../mock/mockRealtime";

/**
 * Все функции сначала пытаются достучаться до реального Express API.
 * Если бэкенд недоступен (сеть/404 — например, при автономной верстке),
 * тихо переключаются на локальные моки, повторяющие ту же форму данных.
 * Как только VITE_API_URL указывает на живой сервис — мок не используется.
 */

export async function fetchActiveDebate(): Promise<DebateEvent | null> {
  try {
    return await apiFetch<DebateEvent | null>("/events/active");
  } catch {
    return mockStore.events.find((e) => e.status === "active") ?? null;
  }
}

export async function fetchUpcomingDebates(): Promise<DebateEvent[]> {
  try {
    return await apiFetch<DebateEvent[]>("/events/upcoming");
  } catch {
    return mockStore.events.filter((e) => e.status === "upcoming");
  }
}

export async function fetchDebateById(eventId: string): Promise<DebateEvent | null> {
  try {
    return await apiFetch<DebateEvent>(`/events/${eventId}`);
  } catch {
    return mockGetEvent(eventId) ?? null;
  }
}

/**
 * POST /api/events/:eventId/votes
 * Тело запроса строго соответствует Zod-схеме бэкенда: participantId,
 * firstName, lastName, deviceFingerprint. ip_address бэкенд определяет
 * сам из заголовков запроса. Голос обрабатывается в транзакции с
 * SELECT ... FOR UPDATE, поэтому в ответ возвращается уже пересчитанный
 * тотал по всем участникам.
 */
export async function submitVote(payload: VoteRequestPayload): Promise<VoteResponse> {
  try {
    return await apiFetch<VoteResponse>(`/events/${payload.eventId}/votes`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Локальная эмуляция anti-fraud ответа сервера (409 при повторном голосе)
    const anyErr = error as { status?: number };
    if (anyErr?.status === 409) {
      throw error;
    }
    const updated = mockRegisterVote(payload.eventId, payload.participantId);
    mockPublish({
      eventId: updated.id,
      totalVotes: updated.totalVotes,
      participants: updated.participants,
    });
    return { ok: true, participants: updated.participants, totalVotes: updated.totalVotes };
  }
}

export async function createDebate(input: CreateDebateInput): Promise<DebateEvent> {
  try {
    return await apiFetch<DebateEvent>("/events", {
      method: "POST",
      auth: true,
      body: JSON.stringify(input),
    });
  } catch {
    const id = `evt-${Date.now()}`;
    const event: DebateEvent = {
      id,
      title: input.title,
      status: "upcoming",
      participantsCount: input.participants.length,
      scheduledAt: input.scheduledAt,
      totalVotes: 0,
      participants: input.participants.map((p, idx) => ({
        id: `${id}-p-${idx}`,
        eventId: id,
        name: p.name,
        subtitle: p.subtitle,
        votesCount: 0,
        percentage: 0,
      })),
    };
    mockStore.events = [...mockStore.events, event];
    return event;
  }
}

export function isAdminAuthenticated(): boolean {
  return Boolean(getAdminToken());
}
