/**
 * Public client models. IDs and statuses intentionally mirror the backend
 * PostgreSQL API so no lossy conversions are needed at the UI boundary.
 */

export type DebateStatus = "upcoming" | "active" | "completed";

export interface Participant {
  id: number;
  eventId: number;
  name: string;
  /** Backend `description`, shown as the short position subtitle in the UI. */
  subtitle?: string;
  votesCount: number;
  percentage: number;
  rank?: number;
}

export interface DebateEvent {
  id: number;
  title: string;
  status: DebateStatus;
  participantsCount: number;
  /** ISO timestamp; backend calls this `dateTime`. */
  scheduledAt: string;
  /** Длительность таймера голосования в минутах (null/отсутствует — выключен). */
  votingDurationMinutes?: number | null;
  /** Дедлайн голосования (ISO): фактический старт + длительность. */
  votingEndsAt?: string | null;
  totalVotes: number;
  participants: Participant[];
  coverGradient?: string;
}

export interface VoteRequestPayload {
  eventId: number;
  participantId: number;
  voterName: string;
  deviceFingerprint: string;
}

export interface VoteResponse {
  ok: boolean;
  alreadyVoted?: boolean;
  message?: string;
  participants: Participant[];
  totalVotes: number;
}

export interface VoteUpdatePayload {
  eventId: number;
  totalVotes: number;
  participants: Participant[];
}

export interface CreateDebateInput {
  title: string;
  /** Число участников (не ограничено сверху; минимум 2). */
  format: number;
  participants: { name: string; subtitle?: string }[];
  scheduledAt: string;
  /** Опциональный таймер голосования, минуты. */
  votingDurationMinutes?: number | null;
}
