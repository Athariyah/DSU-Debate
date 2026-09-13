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

const participantDraftSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const createEventSchema = z.object({
  title: z.string().trim().min(3).max(500),
  dateTime: z.string().datetime({ offset: true }).or(z.string().min(1)),
  status: eventStatusEnum.optional().default("upcoming"),
  // Optional keeps the CRUD endpoint backwards compatible. When supplied,
  // event and participants are persisted atomically in one transaction.
  participants: z.array(participantDraftSchema).min(2).max(3).optional(),
});

export const updateEventSchema = z.object({
  title: z.string().trim().min(3).max(500).optional(),
  dateTime: z.string().min(1).optional(),
  status: eventStatusEnum.optional(),
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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const castVoteSchema = z.object({
  participantId: z.number().int().positive(),
  voterName: z.string().trim().max(255).optional().nullable(),
  deviceFingerprint: z
    .string()
    .regex(UUID_V4_REGEX, "deviceFingerprint должен быть валидным UUID v4"),
});
