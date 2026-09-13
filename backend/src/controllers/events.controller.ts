import { Request, Response } from "express";
import { pool, withTransaction } from "../config/db";
import { EventRecord } from "../types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import { createEventSchema, updateEventSchema } from "../validation/schemas";
import { broadcastEventStatusChanged } from "../sockets";

function serializeEvent(row: EventRecord & { participants_count?: string }) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dateTime: row.date_time,
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
  const { title, dateTime, status, participants } = parsed.data;
  const adminId = req.admin!.adminId;

  const event = await withTransaction(async (client) => {
    // Поддерживаем инвариант "один активный дебат одновременно":
    // если создаём сразу активный дебат — предыдущий активный переводим в completed.
    if (status === "active") {
      await client.query(
        `UPDATE events SET status = 'completed' WHERE status = 'active'`
      );
    }

    const inserted = await client.query<EventRecord>(
      `INSERT INTO events (title, status, date_time, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [title, status, dateTime, adminId]
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

  res.status(201).json({ event: serializeEvent(event) });
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
  const { title, dateTime, status } = parsed.data;

  if (title === undefined && dateTime === undefined && status === undefined) {
    throw new ApiError(400, "VALIDATION_ERROR", "Нет полей для обновления");
  }

  const updatedEvent = await withTransaction(async (client) => {
    const existing = await client.query<EventRecord>(
      "SELECT * FROM events WHERE id = $1 FOR UPDATE",
      [eventId]
    );
    if (existing.rowCount === 0) {
      throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");
    }

    if (status === "active") {
      await client.query(
        `UPDATE events SET status = 'completed' WHERE status = 'active' AND id <> $1`,
        [eventId]
      );
    }

    const updated = await client.query<EventRecord>(
      `UPDATE events
       SET title = COALESCE($1, title),
           date_time = COALESCE($2, date_time),
           status = COALESCE($3, status)
       WHERE id = $4
       RETURNING *`,
      [title ?? null, dateTime ?? null, status ?? null, eventId]
    );
    return updated.rows[0];
  });

  if (status) {
    broadcastEventStatusChanged(eventId, status);
  }

  res.status(200).json({ event: serializeEvent(updatedEvent) });
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
