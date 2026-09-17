import { Request, Response } from "express";
import { pool, withTransaction } from "../config/db";
import { EventRecord } from "../types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import { createEventSchema, eventStatusEnum, updateEventSchema } from "../validation/schemas";
import { broadcastEventStatusChanged } from "../sockets";
import { votingEndsAt } from "../utils/votingWindow";

function serializeEvent(row: EventRecord & { participants_count?: string }) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dateTime: row.date_time,
    votingDurationMinutes: row.voting_duration_minutes ?? null,
    votingEndsAt: votingEndsAt(row)?.toISOString() ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participantsCount:
      row.participants_count !== undefined ? Number(row.participants_count) : undefined,
  };
}

/**
 * POST /api/admin/events
 */
export const createEvent = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  }
  const { title, dateTime, status, votingDurationMinutes, participants } = parsed.data;
  const adminId = req.admin!.adminId;

  if (status === "active" && (!participants || participants.length < 2)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Активный дебат должен иметь минимум двух участников");
  }

  let previousActiveId: number | null = null;
  const event = await withTransaction(async (client) => {
    // Поддерживаем инвариант "один активный дебат одновременно":
    // если создаём сразу активный дебат — предыдущий активный переводим в completed.
    if (status === "active") {
      const previous = await client.query<{ id: number }>(
        "SELECT id FROM events WHERE status = 'active' FOR UPDATE"
      );
      previousActiveId = previous.rows[0]?.id ?? null;
      await client.query(`UPDATE events SET status = 'completed' WHERE status = 'active'`);
    }

    const inserted = await client.query<EventRecord>(
      `INSERT INTO events (
         title, status, date_time, voting_duration_minutes, voting_started_at, created_by
       )
       VALUES ($1, $2, $3, $4, CASE WHEN $2 = 'active'::event_status THEN now() ELSE NULL END, $5)
       RETURNING *`,
      [title, status, dateTime, votingDurationMinutes ?? null, adminId]
    );

    if (participants) {
      for (const participant of participants) {
        await client.query(
          `INSERT INTO participants (event_id, name, description)
           VALUES ($1, $2, $3)`,
          [inserted.rows[0].id, participant.name, participant.description ?? null]
        );
      }
    }

    return inserted.rows[0];
  });

  if (previousActiveId !== null) {
    broadcastEventStatusChanged(previousActiveId, "completed");
  }

  const participantsCount = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM participants WHERE event_id = $1",
    [event.id]
  );
  res.status(201).json({
    event: { ...serializeEvent(event), participantsCount: Number(participantsCount.rows[0].count) },
  });
});

/**
 * GET /api/admin/events?status=active&page=1&limit=20
 */
export const listEvents = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1),
    100
  );
  const offset = (page - 1) * limit;
  const statusFilter = req.query.status ? String(req.query.status) : null;
  if (statusFilter && !eventStatusEnum.safeParse(statusFilter).success) {
    throw new ApiError(400, "VALIDATION_ERROR", "Некорректный статус мероприятия");
  }

  const values: unknown[] = [];
  let whereClause = "";
  if (statusFilter) {
    values.push(statusFilter);
    whereClause = `WHERE e.status = $${values.length}`;
  }

  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM events e ${whereClause}`,
    values
  );

  values.push(limit, offset);
  const itemsResult = await pool.query<EventRecord & { participants_count: string }>(
    `SELECT e.*, COUNT(p.id)::text AS participants_count
     FROM events e
     LEFT JOIN participants p ON p.event_id = e.id
     ${whereClause}
     GROUP BY e.id
     ORDER BY e.date_time DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  res.status(200).json({
    items: itemsResult.rows.map(serializeEvent),
    total: Number(totalResult.rows[0].count),
    page,
    limit,
  });
});

/**
 * GET /api/admin/events/:id
 */
export const getEventById = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  }

  const eventResult = await pool.query<EventRecord>(
    "SELECT * FROM events WHERE id = $1",
    [eventId]
  );
  if (eventResult.rowCount === 0) {
    throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");
  }

  const participantsResult = await pool.query(
    `SELECT p.id, p.name, p.description, COUNT(v.id)::int AS votes_count
     FROM participants p
     LEFT JOIN votes v ON v.participant_id = p.id
     WHERE p.event_id = $1
     GROUP BY p.id
     ORDER BY p.id ASC`,
    [eventId]
  );

  res.status(200).json({
    event: serializeEvent(eventResult.rows[0]),
    participants: participantsResult.rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      votesCount: p.votes_count,
    })),
  });
});

/**
 * PUT /api/admin/events/:id
 */
export const updateEvent = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  }

  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  }
  const { title, dateTime, status, votingDurationMinutes } = parsed.data;

  if (
    title === undefined &&
    dateTime === undefined &&
    status === undefined &&
    votingDurationMinutes === undefined
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "Нет полей для обновления");
  }

  let previousActiveId: number | null = null;
  const updatedEvent = await withTransaction(async (client) => {
    const existing = await client.query<EventRecord>(
      "SELECT * FROM events WHERE id = $1 FOR UPDATE",
      [eventId]
    );
    if (existing.rowCount === 0) {
      throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");
    }

    if (status === "active") {
      const participantsCount = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM participants WHERE event_id = $1",
        [eventId]
      );
      if (Number(participantsCount.rows[0].count) < 2) {
        throw new ApiError(400, "VALIDATION_ERROR", "Активный дебат должен иметь минимум двух участников");
      }
      const previous = await client.query<{ id: number }>(
        "SELECT id FROM events WHERE status = 'active' AND id <> $1 FOR UPDATE",
        [eventId]
      );
      previousActiveId = previous.rows[0]?.id ?? null;
      await client.query(
        `UPDATE events SET status = 'completed' WHERE status = 'active' AND id <> $1`,
        [eventId]
      );
    }

    // SET собираем динамически: votingDurationMinutes = null — это явное
    // выключение таймера, и COALESCE его не отличит от «поле не прислано».
    const setClauses: string[] = [];
    const values: unknown[] = [];
    const current = existing.rows[0];
    const timerEnabledAfterUpdate =
      votingDurationMinutes === undefined
        ? current.voting_duration_minutes !== null
        : votingDurationMinutes !== null;
    const startsNow =
      timerEnabledAfterUpdate &&
      ((status === "active" && current.status !== "active") ||
        (current.status === "active" && current.voting_started_at == null));

    // Новый активный дебат получает собственную точку отсчёта. Если таймер
    // выключили или дебат вернули в расписание, старый старт больше не должен
    // неожиданно включить автостоп при следующем запуске.
    if (startsNow) setClauses.push("voting_started_at = now()");
    else if (status === "upcoming" || votingDurationMinutes === null) {
      setClauses.push("voting_started_at = NULL");
    }
    if (title !== undefined) {
      values.push(title);
      setClauses.push(`title = $${values.length}`);
    }
    if (dateTime !== undefined) {
      values.push(dateTime);
      setClauses.push(`date_time = $${values.length}`);
    }
    if (status !== undefined) {
      values.push(status);
      setClauses.push(`status = $${values.length}`);
    }
    if (votingDurationMinutes !== undefined) {
      values.push(votingDurationMinutes);
      setClauses.push(`voting_duration_minutes = $${values.length}`);
    }
    values.push(eventId);
    const updated = await client.query<EventRecord>(
      `UPDATE events SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values
    );
    return updated.rows[0];
  });

  if (previousActiveId !== null) {
    broadcastEventStatusChanged(previousActiveId, "completed");
  }
  if (status) {
    broadcastEventStatusChanged(eventId, status);
  }

  const participantsCount = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM participants WHERE event_id = $1",
    [eventId]
  );
  res.status(200).json({
    event: { ...serializeEvent(updatedEvent), participantsCount: Number(participantsCount.rows[0].count) },
  });
});

/**
 * DELETE /api/admin/events/:id
 */
export const deleteEvent = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  }

  const result = await pool.query("DELETE FROM events WHERE id = $1 RETURNING id", [
    eventId,
  ]);
  if (result.rowCount === 0) {
    throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");
  }

  res.status(204).send();
});
