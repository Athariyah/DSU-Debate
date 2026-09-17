import { Request, Response } from "express";
import { pool } from "../config/db";
import { EventRecord } from "../types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import { votingEndsAt } from "../utils/votingWindow";
import { computeEventResults, redactEventResults } from "./vote.controller";

function publicEventResponse(event: EventRecord, results: Awaited<ReturnType<typeof computeEventResults>>) {
  const votesHidden = Boolean(event.votes_hidden);
  const visibleResults = votesHidden ? redactEventResults(results) : results;
  return {
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      eventType: (event as any).event_type ?? event.event_type ?? "debate",
      customTypeLabel: (event as any).custom_type_label ?? (event as any).customTypeLabel ?? null,
      dateTime: event.date_time,
      votingDurationMinutes: event.voting_duration_minutes ?? null,
      votingEndsAt: votingEndsAt(event)?.toISOString() ?? null,
      votesHidden,
      participantsCount: results.participants.length,
      showLeaderboard: (event as any).show_leaderboard === undefined || (event as any).show_leaderboard === null ? true : Boolean((event as any).show_leaderboard),
      showStandings: (event as any).show_standings === undefined || (event as any).show_standings === null ? true : Boolean((event as any).show_standings),
      showPodium: (event as any).show_podium === undefined || (event as any).show_podium === null ? true : Boolean((event as any).show_podium),
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

/** Оптимизированная пакетная загрузка: 1 запрос на события + 1 JOIN на всех участников/голоса (вместо N+1). */
async function batchPublicEvents(eventRows: EventRecord[]) {
  if (eventRows.length === 0) return [];
  const ids = eventRows.map((e) => e.id);
  const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(", ");
  // Один LEFT JOIN на все события — считаем голоса сразу по всем участникам
  const agg = await pool.query<{
    event_id: number;
    id: number;
    name: string;
    description: string | null;
    votes_count: string;
  }>(
    `SELECT p.event_id, p.id, p.name, p.description, COUNT(v.id) AS votes_count
     FROM participants p
     LEFT JOIN votes v ON v.participant_id = p.id
     WHERE p.event_id IN (${placeholders})
     GROUP BY p.event_id, p.id, p.name, p.description
     ORDER BY p.event_id ASC, p.id ASC`,
    ids
  );
  const byEvent = new Map<number, typeof agg.rows>();
  for (const r of agg.rows) {
    const list = byEvent.get(r.event_id) ?? [];
    list.push(r);
    byEvent.set(r.event_id, list as any);
  }
  return eventRows.map((event) => {
    const rows = byEvent.get(event.id) ?? [];
    const participantsData = rows.map((r) => ({
      participantId: r.id,
      name: r.name,
      description: r.description,
      votesCount: Number(r.votes_count),
    }));
    const totalVotes = participantsData.reduce((sum, p) => sum + p.votesCount, 0);
    const participants = participantsData.map((p) => ({
      ...p,
      percentage: totalVotes === 0 ? 0 : Math.round((p.votesCount / totalVotes) * 1000) / 10,
    }));
    const results = { eventId: event.id, totalVotes, participants } as Awaited<ReturnType<typeof computeEventResults>>;
    return publicEventResponse(event as EventRecord, results);
  });
}

/** GET /api/events/upcoming — 2 запроса вместо 1+N */
export const listUpcomingEvents = asyncHandler(async (_req: Request, res: Response) => {
  const events = await pool.query<EventRecord>(
    `SELECT * FROM events
     WHERE status = 'upcoming' AND ${PUBLIC_EVENT_FILTER}
     ORDER BY date_time ASC`
  );
  const responses = await batchPublicEvents(events.rows);
  res.status(200).json(responses);
});

/** GET /api/events/history — 3 запроса (count + events + один JOIN) вместо 2+N */
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
  const items = await batchPublicEvents(events.rows);
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
