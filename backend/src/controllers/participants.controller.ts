import { Request, Response } from "express";
import { pool } from "../config/db";
import { EventRecord, ParticipantRecord } from "../types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import { createParticipantSchema, updateParticipantSchema } from "../validation/schemas";

function serializeParticipant(row: ParticipantRecord) {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  };
}

export const createParticipant = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createParticipantSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  }
  const { eventId, name, description } = parsed.data;

  const eventResult = await pool.query<EventRecord>("SELECT id FROM events WHERE id = $1", [eventId]);
  if (eventResult.rowCount === 0) {
    throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");
  }
  const countResult = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM participants WHERE event_id = $1",
    [eventId]
  );
  if (Number(countResult.rows[0].count) >= 3) {
    throw new ApiError(400, "PARTICIPANTS_LIMIT", "У мероприятия может быть не более трёх участников");
  }

  const inserted = await pool.query<ParticipantRecord>(
    `INSERT INTO participants (event_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [eventId, name, description ?? null]
  );

  res.status(201).json({ participant: serializeParticipant(inserted.rows[0]) });
});

export const listParticipants = asyncHandler(async (req: Request, res: Response) => {
  const eventId = req.query.eventId ? parseInt(String(req.query.eventId), 10) : null;
  const values: unknown[] = [];
  let whereClause = "";
  if (eventId !== null) {
    if (Number.isNaN(eventId)) {
      throw new ApiError(400, "VALIDATION_ERROR", "Некорректный eventId");
    }
    values.push(eventId);
    whereClause = "WHERE event_id = $1";
  }

  const result = await pool.query<ParticipantRecord>(
    `SELECT * FROM participants ${whereClause} ORDER BY id ASC`,
    values
  );
  res.status(200).json({ items: result.rows.map(serializeParticipant) });
});

export const getParticipantById = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id участника");
  }

  const result = await pool.query<ParticipantRecord>("SELECT * FROM participants WHERE id = $1", [id]);
  if (result.rowCount === 0) {
    throw new ApiError(404, "PARTICIPANT_NOT_FOUND", "Участник не найден");
  }
  res.status(200).json({ participant: serializeParticipant(result.rows[0]) });
});

export const updateParticipant = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id участника");
  }

  const parsed = updateParticipantSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  }
  const { name, description } = parsed.data;
  if (name === undefined && description === undefined) {
    throw new ApiError(400, "VALIDATION_ERROR", "Нет полей для обновления");
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined) {
    values.push(name);
    updates.push(`name = $${values.length}`);
  }
  if (description !== undefined) {
    values.push(description);
    updates.push(`description = $${values.length}`);
  }
  values.push(id);

  const result = await pool.query<ParticipantRecord>(
    `UPDATE participants SET ${updates.join(", ")} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (result.rowCount === 0) {
    throw new ApiError(404, "PARTICIPANT_NOT_FOUND", "Участник не найден");
  }
  res.status(200).json({ participant: serializeParticipant(result.rows[0]) });
});

export const deleteParticipant = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id участника");
  }

  const result = await pool.query("DELETE FROM participants WHERE id = $1 RETURNING id", [id]);
  if (result.rowCount === 0) {
    throw new ApiError(404, "PARTICIPANT_NOT_FOUND", "Участник не найден");
  }
  res.status(204).send();
});
