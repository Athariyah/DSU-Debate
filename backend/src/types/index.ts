export type EventStatus = "upcoming" | "active" | "completed";
export type EventType = "debate" | "tournament" | "poll" | "competition" | "quiz" | "other";

export interface AdminRecord {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface EventRecord {
  id: number;
  title: string;
  status: EventStatus;
  event_type: EventType;
  date_time: Date;
  /** Длительность голосования в минутах (NULL — таймер выключен). */
  voting_duration_minutes: number | null;
  /** Фактический момент запуска активного голосования. */
  voting_started_at: Date | null;
  /** TRUE — результаты скрыты от зрителей (закрытое голосование). */
  votes_hidden: boolean;
  /** TRUE — дебат скрыт от обычных пользователей (виден только администраторам). */
  hidden_from_public: boolean;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}

export interface ParticipantRecord {
  id: number;
  event_id: number;
  name: string;
  description: string | null;
  created_at: Date;
}

export interface VoteRecord {
  id: number;
  event_id: number;
  participant_id: number;
  voter_name: string | null;
  device_fingerprint: string;
  ip_address: string;
  created_at: Date;
}

export interface MatchRecord {
  id: number;
  event_id: number;
  round: number;
  participant1_id: number;
  participant2_id: number;
  winner_id: number | null;
  score1: number;
  score2: number;
  status: "upcoming" | "active" | "completed" | "draw";
  scheduled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TournamentStandingRecord {
  id: number;
  event_id: number;
  participant_id: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  position: number | null;
  updated_at: Date;
}

export interface LeaderboardRecord {
  id: number;
  event_id: number;
  participant_id: number;
  score: number;
  rank: number | null;
  updated_at: Date;
}

export interface PodiumRecord {
  id: number;
  event_id: number;
  participant_id: number;
  place: number;
  created_at: Date;
}

export interface JwtPayload {
  adminId: number;
  email: string;
}

export interface ParticipantResult {
  participantId: number;
  name: string;
  description: string | null;
  votesCount: number;
  percentage: number;
}

export interface EventResults {
  eventId: number;
  totalVotes: number;
  participants: ParticipantResult[];
}

// Расширяем Express Request, чтобы прокидывать данные авторизованного админа
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: JwtPayload;
    }
  }
}
