/**
 * Public client models. IDs and statuses intentionally mirror the backend
 * PostgreSQL API so no lossy conversions are needed at the UI boundary.
 */

export type DebateStatus = "upcoming" | "active" | "completed";
export type EventType = "debate" | "tournament" | "poll" | "competition" | "quiz" | "other";

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
  eventType?: EventType;
  /** Кастомное название когда eventType === "other" */
  customTypeLabel?: string | null;
  participantsCount: number;
  /** ISO timestamp; backend calls this `dateTime`. */
  scheduledAt: string;
  /** Длительность таймера голосования в минутах (null/отсутствует — выключен). */
  votingDurationMinutes?: number | null;
  /** Дедлайн голосования (ISO): фактический старт + длительность. */
  votingEndsAt?: string | null;
  /** true — закрытое голосование: сервер зануляет цифры, показываем плашку «скрыто». */
  votesHidden?: boolean;
  /** true — мероприятие скрыто от обычных пользователей (виден только в админке). */
  hiddenFromPublic?: boolean;
  /** Гибкие вкладки */
  showLeaderboard?: boolean;
  showStandings?: boolean;
  showPodium?: boolean;
  /** Текст для трансляции (крупно по центру) */
  broadcastMessage?: string | null;
  totalVotes: number;
  participants: Participant[];
  coverGradient?: string;
}
// Алиасы для нового нейминга DSU Event (обратная совместимость)
export type EventStatus = DebateStatus;
export type AppEvent = DebateEvent;
// Event alias removed to avoid DOM conflict — use AppEvent

export interface Match {
  id: number;
  eventId: number;
  round: number;
  participant1Id: number;
  participant2Id: number;
  winnerId: number | null;
  score1: number;
  score2: number;
  status: "upcoming" | "active" | "completed" | "draw";
  scheduledAt: string | null;
}

export interface TournamentStanding {
  id: number;
  event_id: number;
  participant_id: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  position: number | null;
  name: string;
  description: string | null;
}

export interface LeaderboardEntry {
  participantId: number;
  name: string;
  description?: string | null;
  score: number;
  rank: number;
}

export interface PodiumEntry {
  place: number;
  participantId: number;
  name: string;
  description?: string | null;
  score?: number;
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
  eventType?: EventType;
  customTypeLabel?: string | null;
  participants: { name: string; subtitle?: string }[];
  scheduledAt: string;
  /** Опциональный таймер голосования, минуты. */
  votingDurationMinutes?: number | null;
  /** true — результаты скрыты */
  votesHidden?: boolean;
  /** true — мероприятие создаётся скрытым от обычных пользователей. */
  hiddenFromPublic?: boolean;
  showLeaderboard?: boolean;
  showStandings?: boolean;
  showPodium?: boolean;
  broadcastMessage?: string | null;
}
export type CreateEventInput = CreateDebateInput;
