import { apiFetch, getAdminToken } from "./httpClient";
import type {
  CreateDebateInput,
  DebateEvent,
  Participant,
  VoteRequestPayload,
  VoteResponse,
} from "../types";
import { mockGetEvent, mockRegisterVote, mockStore } from "../mock/mockData";
import { mockPublish } from "../mock/mockRealtime";

interface BackendEvent {
  id: number;
  title: string;
  status: "upcoming" | "active" | "completed";
  eventType?: string;
  dateTime: string;
  votingDurationMinutes?: number | null;
  votingEndsAt?: string | null;
  votesHidden?: boolean;
  hiddenFromPublic?: boolean;
  participantsCount?: number;
}

interface BackendParticipant {
  id: number;
  eventId?: number;
  name: string;
  description?: string | null;
  votesCount?: number;
  percentage?: number;
}

interface BackendPublicEventResponse {
  event: BackendEvent;
  participants: BackendParticipant[];
  totalVotes: number;
}

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

function mapParticipant(raw: BackendParticipant, eventId: number): Participant {
  return {
    id: Number(raw.id),
    eventId,
    name: raw.name,
    subtitle: raw.description ?? undefined,
    votesCount: Number(raw.votesCount ?? 0),
    percentage: Number(raw.percentage ?? 0),
  };
}

function mapPublicEvent(payload: BackendPublicEventResponse): DebateEvent {
  const eventId = Number(payload.event.id);
  const participants = payload.participants.map((participant) =>
    mapParticipant(participant, eventId)
  );

  return {
    id: eventId,
    title: payload.event.title,
    status: payload.event.status,
    eventType: (payload.event.eventType as any) ?? "debate",
    participantsCount: Number(payload.event.participantsCount ?? participants.length),
    scheduledAt: payload.event.dateTime,
    votingDurationMinutes: payload.event.votingDurationMinutes ?? null,
    votingEndsAt: payload.event.votingEndsAt ?? null,
    votesHidden: Boolean(payload.event.votesHidden),
    hiddenFromPublic: Boolean(payload.event.hiddenFromPublic),
    totalVotes: Number(payload.totalVotes ?? 0),
    participants,
  };
}

function mapVoteResponse(payload: {
  success: boolean;
  results: {
    eventId: number;
    totalVotes: number;
    participants: BackendParticipant[];
  };
}): VoteResponse {
  return {
    ok: payload.success,
    totalVotes: payload.results.totalVotes,
    participants: payload.results.participants.map((participant) =>
      mapParticipant(participant, payload.results.eventId)
    ),
  };
}

/** Return the active event, or null when the backend correctly reports 404. */
export async function fetchActiveDebate(): Promise<DebateEvent | null> {
  try {
    const response = await apiFetch<BackendPublicEventResponse>("/events/active");
    return mapPublicEvent(response);
  } catch (error) {
    if (isNotFound(error)) return null;
    if (USE_MOCKS) return mockStore.events.find((event) => event.status === "active" && !event.hiddenFromPublic) ?? null;
    throw error;
  }
}

export async function fetchUpcomingDebates(): Promise<DebateEvent[]> {
  try {
    const response = await apiFetch<BackendPublicEventResponse[]>("/events/upcoming");
    return response.map(mapPublicEvent);
  } catch (error) {
    if (USE_MOCKS) return mockStore.events.filter((event) => event.status === "upcoming" && !event.hiddenFromPublic);
    throw error;
  }
}

export async function fetchCompletedDebates(page = 1, limit = 20): Promise<{ items: DebateEvent[]; total: number }> {
  try {
    const response = await apiFetch<{ items: BackendPublicEventResponse[]; total: number }>(
      `/events/history?page=${page}&limit=${limit}`
    );
    return { items: response.items.map(mapPublicEvent), total: response.total };
  } catch (error) {
    if (USE_MOCKS) {
      const items = mockStore.events.filter((event) => event.status === "completed" && !event.hiddenFromPublic);
      return { items, total: items.length };
    }
    throw error;
  }
}

export async function fetchDebateById(eventId: string): Promise<DebateEvent | null> {
  try {
    const response = await apiFetch<BackendPublicEventResponse>(`/events/${eventId}`);
    return mapPublicEvent(response);
  } catch (error) {
    if (isNotFound(error)) return null;
    if (USE_MOCKS) {
      const mockEvent = mockGetEvent(Number(eventId));
      return mockEvent && !mockEvent.hiddenFromPublic ? mockEvent : null;
    }
    throw error;
  }
}

export async function submitVote(payload: VoteRequestPayload): Promise<VoteResponse> {
  try {
    const response = await apiFetch<{
      success: boolean;
      results: {
        eventId: number;
        totalVotes: number;
        participants: BackendParticipant[];
      };
    }>(`/events/${payload.eventId}/vote`, {
      method: "POST",
      body: JSON.stringify({
        participantId: payload.participantId,
        voterName: payload.voterName,
        deviceFingerprint: payload.deviceFingerprint,
      }),
    });
    return mapVoteResponse(response);
  } catch (error) {
    if (!USE_MOCKS) throw error;
    const updated = mockRegisterVote(payload.eventId, payload.participantId);
    mockPublish({
      eventId: updated.id,
      totalVotes: updated.totalVotes,
      participants: updated.participants,
    });
    return { ok: true, participants: updated.participants, totalVotes: updated.totalVotes };
  }
}

export interface AdminEventSummary {
  id: number;
  title: string;
  status: DebateEvent["status"];
  eventType: DebateEvent["eventType"];
  dateTime: string;
  /** Таймер голосования в минутах (null — выключен). */
  votingDurationMinutes: number | null;
  /** true — зрители не видят голоса и проценты (закрытое голосование). */
  votesHidden: boolean;
  /** true — дебат скрыт от обычных пользователей (виден только в админке). */
  hiddenFromPublic: boolean;
  participantsCount: number;
}

export async function listAdminDebates(status?: DebateEvent["status"]): Promise<AdminEventSummary[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await apiFetch<{ items: AdminEventSummary[] }>(`/admin/events${query}`, { auth: true });
  // Старый backend мог не отдавать поля — нормализуем в null/false.
  return response.items.map((item) => ({
    ...item,
    eventType: (item as any).eventType ?? "debate",
    votingDurationMinutes: item.votingDurationMinutes ?? null,
    votesHidden: item.votesHidden ?? false,
    hiddenFromPublic: item.hiddenFromPublic ?? false,
  }));
}

export async function updateDebate(
  eventId: number,
  patch: Partial<Pick<AdminEventSummary, "title" | "status" | "eventType" | "votingDurationMinutes" | "votesHidden" | "hiddenFromPublic">> & {
    dateTime?: string;
    eventType?: DebateEvent["eventType"];
  }
): Promise<AdminEventSummary> {
  const response = await apiFetch<{ event: AdminEventSummary }>(`/admin/events/${eventId}`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify(patch),
  });
  return response.event;
}

export async function deleteDebate(eventId: number): Promise<void> {
  await apiFetch<void>(`/admin/events/${eventId}`, { method: "DELETE", auth: true });
}

export interface AdminParticipant {
  id: number;
  eventId: number;
  name: string;
  description: string | null;
}

export async function listAdminParticipants(eventId: number): Promise<AdminParticipant[]> {
  const response = await apiFetch<{ items: AdminParticipant[] }>(
    `/admin/participants?eventId=${eventId}`,
    { auth: true }
  );
  return response.items;
}

export async function updateAdminParticipant(
  participantId: number,
  patch: { name?: string; description?: string | null }
): Promise<AdminParticipant> {
  const response = await apiFetch<{ participant: AdminParticipant }>(`/admin/participants/${participantId}`, {
    method: "PUT",
    auth: true,
    body: JSON.stringify(patch),
  });
  return response.participant;
}

export async function deleteAdminParticipant(participantId: number): Promise<void> {
  await apiFetch<void>(`/admin/participants/${participantId}`, { method: "DELETE", auth: true });
}

export async function createAdminParticipant(
  eventId: number,
  participant: { name: string; description?: string | null }
): Promise<AdminParticipant> {
  const response = await apiFetch<{ participant: AdminParticipant }>("/admin/participants", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ eventId, ...participant }),
  });
  return response.participant;
}

export async function createDebate(input: CreateDebateInput): Promise<DebateEvent> {
  if (!getAdminToken()) {
    throw new Error("Для создания дебата требуется токен администратора");
  }

  const created = await apiFetch<{ event: BackendEvent }>("/admin/events", {
    method: "POST",
    auth: true,
    body: JSON.stringify({
      title: input.title,
      dateTime: input.scheduledAt,
      status: "upcoming",
      eventType: input.eventType ?? "debate",
      votingDurationMinutes: input.votingDurationMinutes ?? null,
      hiddenFromPublic: input.hiddenFromPublic ?? false,
      participants: input.participants.map((participant) => ({
        name: participant.name,
        description: participant.subtitle ?? null,
      })),
    }),
  });

  const eventId = Number(created.event.id);
  const event = await fetchDebateById(String(eventId));
  if (!event) throw new Error("Созданный дебат не найден после сохранения");
  return event;
}

export interface AdminAuthResponse {
  admin: { id: number; email: string };
  token: string;
  expiresIn: string;
}

export async function loginAdmin(email: string, password: string): Promise<AdminAuthResponse> {
  const response = await apiFetch<AdminAuthResponse>("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return response;
}

export async function registerAdmin(email: string, password: string, registrationKey: string): Promise<AdminAuthResponse> {
  return apiFetch<AdminAuthResponse>("/admin/auth/register", {
    method: "POST",
    headers: { "X-Admin-Registration-Key": registrationKey },
    body: JSON.stringify({ email, password }),
  });
}

export async function logoutAdmin(): Promise<void> {
  await apiFetch<void>("/admin/auth/logout", { method: "POST", auth: true });
}

export function isAdminAuthenticated(): boolean {
  return Boolean(getAdminToken());
}

export async function fetchLeaderboard(eventId: number): Promise<{ eventId: number; items: import("../types").LeaderboardEntry[] }> {
  return apiFetch(`/events/${eventId}/leaderboard`);
}
export async function fetchPodium(eventId: number): Promise<{ eventId: number; podium: import("../types").PodiumEntry[] }> {
  return apiFetch(`/events/${eventId}/podium`);
}
export async function fetchStandings(eventId: number): Promise<{ items: import("../types").TournamentStanding[] }> {
  return apiFetch(`/events/${eventId}/standings`);
}
export async function fetchMatches(eventId: number): Promise<{ items: import("../types").Match[] }> {
  return apiFetch(`/events/${eventId}/matches`);
}

export async function createMatchApi(eventId: number, data: Partial<import("../types").Match>): Promise<{ match: import("../types").Match }> {
  return apiFetch(`/admin/events/${eventId}/matches`, { method: "POST", auth: true, body: JSON.stringify(data) });
}
export async function updateMatchApi(matchId: number, data: Partial<import("../types").Match>): Promise<{ match: import("../types").Match }> {
  return apiFetch(`/admin/matches/${matchId}`, { method: "PUT", auth: true, body: JSON.stringify(data) });
}
export async function deleteMatchApi(matchId: number): Promise<void> {
  await apiFetch(`/admin/matches/${matchId}`, { method: "DELETE", auth: true });
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}
