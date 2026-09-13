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
  dateTime: string;
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
    participantsCount: Number(payload.event.participantsCount ?? participants.length),
    scheduledAt: payload.event.dateTime,
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
    if (USE_MOCKS) return mockStore.events.find((event) => event.status === "active") ?? null;
    throw error;
  }
}

export async function fetchUpcomingDebates(): Promise<DebateEvent[]> {
  try {
    const response = await apiFetch<BackendPublicEventResponse[]>("/events/upcoming");
    return response.map(mapPublicEvent);
  } catch (error) {
    if (USE_MOCKS) return mockStore.events.filter((event) => event.status === "upcoming");
    throw error;
  }
}

export async function fetchDebateById(eventId: string): Promise<DebateEvent | null> {
  try {
    const response = await apiFetch<BackendPublicEventResponse>(`/events/${eventId}`);
    return mapPublicEvent(response);
  } catch (error) {
    if (isNotFound(error)) return null;
    if (USE_MOCKS) return mockGetEvent(Number(eventId)) ?? null;
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

export function isAdminAuthenticated(): boolean {
  return Boolean(getAdminToken());
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}
