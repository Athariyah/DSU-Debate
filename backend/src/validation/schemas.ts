import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Некорректный формат email"),
  password: z
    .string()
    .min(8, "Пароль должен содержать минимум 8 символов")
    .max(100),
});

export const loginSchema = z.object({
  email: z.string().email("Некорректный формат email"),
  password: z.string().min(1, "Пароль обязателен"),
});

export const eventStatusEnum = z.enum(["upcoming", "active", "completed"]);
export const eventTypeEnum = z.enum(["debate", "tournament", "poll", "competition", "quiz", "other"]);

// Длительность таймера голосования в минутах: 1..1440 (сутки).
// null/отсутствие — таймер выключен, голосование идёт до смены статуса.
export const votingDurationSchema = z
  .number()
  .int("Таймер задаётся целым числом минут")
  .min(1, "Таймер должен быть не меньше 1 минуты")
  .max(1440, "Таймер не может быть больше суток");

const participantDraftSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const createEventSchema = z.object({
  title: z.string().trim().min(3).max(500),
  dateTime: z.string().datetime({ offset: true }),
  status: eventStatusEnum.optional().default("upcoming"),
  eventType: eventTypeEnum.optional().default("debate"),
  customTypeLabel: z.string().trim().min(1).max(50).optional().nullable(),
  votingDurationMinutes: votingDurationSchema.nullable().optional(),
  // TRUE — результаты скрыты от зрителей (закрытое голосование)
  votesHidden: z.boolean().optional(),
  // TRUE — мероприятие скрыто от обычных пользователей (виден только администраторам).
  hiddenFromPublic: z.boolean().optional(),
  showLeaderboard: z.boolean().optional(),
  showStandings: z.boolean().optional(),
  showPodium: z.boolean().optional(),
  // Optional keeps the CRUD endpoint backwards compatible. When supplied,
  // event and participants are persisted atomically in one transaction.
  // Число участников не ограничено сверху: минимум 2 (дебаты требуют сторон).
  participants: z.array(participantDraftSchema).min(2).optional(),
});

export const updateEventSchema = z.object({
  title: z.string().trim().min(3).max(500).optional(),
  dateTime: z.string().datetime({ offset: true }).optional(),
  status: eventStatusEnum.optional(),
  eventType: eventTypeEnum.optional(),
  customTypeLabel: z.string().trim().min(1).max(50).optional().nullable(),
  // null — явное выключение таймера (в отличие от «поле не передано»).
  votingDurationMinutes: votingDurationSchema.nullable().optional(),
  // true — закрытое голосование: зрители не видят голоса и проценты.
  votesHidden: z.boolean().optional(),
  // true — мероприятие скрыто от обычных пользователей (виден только администраторам).
  hiddenFromPublic: z.boolean().optional(),
  showLeaderboard: z.boolean().optional(),
  showStandings: z.boolean().optional(),
  showPodium: z.boolean().optional(),
});

export const createParticipantSchema = z.object({
  eventId: z.number().int().positive(),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const updateParticipantSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const castVoteSchema = z.object({
  participantId: z.number().int().positive(),
  voterName: z.string().trim().max(255).optional().nullable(),
  deviceFingerprint: z
    .string()
    .regex(UUID_V4_REGEX, "deviceFingerprint должен быть валидным UUID v4"),
});

export const createMatchSchema = z.object({
  eventId: z.number().int().positive(),
  round: z.number().int().min(1).optional().default(1),
  participant1Id: z.number().int().positive(),
  participant2Id: z.number().int().positive(),
  winnerId: z.number().int().positive().nullable().optional(),
  score1: z.number().int().min(0).optional().default(0),
  score2: z.number().int().min(0).optional().default(0),
  status: z.enum(["upcoming", "active", "completed", "draw"]).optional().default("upcoming"),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const updateMatchSchema = z.object({
  round: z.number().int().min(1).optional(),
  participant1Id: z.number().int().positive().optional(),
  participant2Id: z.number().int().positive().optional(),
  winnerId: z.number().int().positive().nullable().optional(),
  score1: z.number().int().min(0).optional(),
  score2: z.number().int().min(0).optional(),
  status: z.enum(["upcoming", "active", "completed", "draw"]).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
});
