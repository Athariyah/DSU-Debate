/**
 * Типы клиента синхронизированы со схемой БД бэкенда:
 * events, participants, votes (см. src/types на бэкенде).
 */

export type DebateStatus = "upcoming" | "active" | "finished";

export interface Participant {
  id: string;
  eventId: string;
  name: string;
  /** Короткая подпись под именем — позиция/сторона участника в дебате */
  subtitle?: string;
  votesCount: number;
  /** Вычисляется на бэкенде (votesCount / totalVotes * 100), 0..100 */
  percentage: number;
  rank?: number;
}

export interface DebateEvent {
  id: string;
  title: string;
  status: DebateStatus;
  participantsCount: number;
  scheduledAt: string; // ISO date
  totalVotes: number;
  participants: Participant[];
  coverGradient?: string;
}

export interface VoteRequestPayload {
  eventId: string;
  participantId: string;
  firstName: string;
  lastName: string;
  deviceFingerprint: string;
}

export interface VoteResponse {
  ok: boolean;
  alreadyVoted?: boolean;
  message?: string;
  participants: Participant[];
  totalVotes: number;
}

/** Полезная нагрузка, приходящая из Socket.io комнаты дебата */
export interface VoteUpdatePayload {
  eventId: string;
  totalVotes: number;
  participants: Participant[];
}

export interface CreateDebateInput {
  title: string;
  format: 2 | 3;
  participants: { name: string; subtitle?: string }[];
  scheduledAt: string;
}
