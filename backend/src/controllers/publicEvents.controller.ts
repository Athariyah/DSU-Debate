import { Request, Response } from "express";
import { pool } from "../config/db";
import { EventRecord } from "../types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import { votingEndsAt } from "../utils/votingWindow";
import { computeEventResults, redactEventResults } from "./vote.controller";

function publicEventResponse(event: EventRecord, results: Awaited<ReturnType<typeof computeEventResults>>) {
  // Закрытое голосование (флажок «Скрыть голоса» в админке): участники и их
  // описания видны, но цифры и проценты сервер зануляет — зритель не узнает
  // расклад до раскрытия.
  const votesHidden = Boolean(event.votes_hidden);
  const visibleResults = votesHidden ? redactEventResults(results) : results;
  return {
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      eventType: (event as any).event_type ?? event.event_type ?? "debate",
      dateTime: event.date_time,
      votingDurationMinutes: event.voting_duration_minutes ?? null,
      votingEndsAt: votingEndsAt(event)?.toISOString() ?? null,
      votesHidden,
      participantsCount: results.participants.length,
    },
    participants: visibleResults.participants.map((participant) => ({
      id: participant.participantId,
      eventId: event.id,
      name: participant.name,
      description: participant.description,
      votesCount: participant.votesCount,
      percentage: participant.percentage,
    })),
    totalVotes: visibleResults.totalVotes,
  };
}

/**
 * Условия публичности: дебаты, скрытые от обычных пользователей
 * (hidden_from_public = TRUE), не попадают ни в один публичный ответ —
 * для них публичные маршруты отвечают 404, как если бы их не существовало.
 */
const PUBLIC_EVENT_FILTER = "COALESCE(hidden_from_public, FALSE) = FALSE";

async function loadPublicEvent(eventId: number) {
  const eventResult = await pool.query<EventRecord>(
    `SELECT * FROM events WHERE id = $1 AND ${PUBLIC_EVENT_FILTER}`,
    [eventId]
  );
  if (eventResult.rowCount === 0) {
    throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");
  }

  const client = await pool.connect();
  try {
    const results = await computeEventResults(client, eventId);
    return publicEventResponse(eventResult.rows[0], results);
  } finally {
    client.release();
  }
}

/** GET /api/events/upcoming */
export const listUpcomingEvents = asyncHandler(async (_req: Request, res: Response) => {
  const events = await pool.query<EventRecord>(
    `SELECT * FROM events
     WHERE status = 'upcoming' AND ${PUBLIC_EVENT_FILTER}
     ORDER BY date_time ASC`
  );

  const responses = await Promise.all(events.rows.map((event) => loadPublicEvent(event.id)));
  res.status(200).json(responses);
});

/** GET /api/events/history?page=1&limit=20 */
export const listCompletedEvents = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const count = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM events WHERE status = 'completed' AND ${PUBLIC_EVENT_FILTER}`);
  const events = await pool.query<EventRecord>(
    `SELECT * FROM events
     WHERE status = 'completed' AND ${PUBLIC_EVENT_FILTER}
     ORDER BY date_time DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const items = await Promise.all(events.rows.map((event) => loadPublicEvent(event.id)));
  res.status(200).json({ items, total: Number(count.rows[0].count), page, limit });
});

/** GET /api/events/:id */
export const getPublicEventById = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  }

  res.status(200).json(await loadPublicEvent(eventId));
});
