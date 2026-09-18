import { Request, Response } from "express";
import { pool, withTransaction } from "../config/db";
import { EventRecord } from "../types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import { createEventSchema, createVotingSchema, eventStatusEnum, updateEventSchema } from "../validation/schemas";
import {
  broadcastBroadcastMessageChanged,
  broadcastEventStatusChanged,
  broadcastPublicVisibilityChanged,
  broadcastVoteUpdate,
  broadcastVoteVisibilityChanged,
} from "../sockets";
import { votingEndsAt } from "../utils/votingWindow";
import { computeEventResults, redactEventResults } from "./vote.controller";

function serializeEvent(row: EventRecord & { participants_count?: string; votings_count?: string; event_type?: string; custom_type_label?: string | null; show_leaderboard?: number | boolean; show_standings?: number | boolean; show_podium?: number | boolean; broadcast_message?: string | null; parent_event_id?: number | null }) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    eventType: (row as any).event_type ?? row.event_type ?? "debate",
    customTypeLabel: (row as any).custom_type_label ?? (row as any).customTypeLabel ?? null,
    dateTime: row.date_time,
    votingDurationMinutes: row.voting_duration_minutes ?? null,
    votingEndsAt: votingEndsAt(row)?.toISOString() ?? null,
    votesHidden: Boolean(row.votes_hidden),
    hiddenFromPublic: Boolean(row.hidden_from_public),
    showLeaderboard: row.show_leaderboard === undefined || row.show_leaderboard === null ? true : Boolean(row.show_leaderboard),
    showStandings: row.show_standings === undefined || row.show_standings === null ? true : Boolean(row.show_standings),
    showPodium: row.show_podium === undefined || row.show_podium === null ? true : Boolean(row.show_podium),
    broadcastMessage: (row as any).broadcast_message ?? (row as any).broadcastMessage ?? null,
    parentEventId: (row as any).parent_event_id ?? (row as any).parentEventId ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    participantsCount:
      row.participants_count !== undefined ? Number(row.participants_count) : undefined,
    votingsCount:
      (row as any).votings_count !== undefined ? Number((row as any).votings_count) : undefined,
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
  const { title, dateTime, status, eventType, customTypeLabel, votingDurationMinutes, votesHidden, hiddenFromPublic, showLeaderboard, showStandings, showPodium, broadcastMessage, participants, votings } = parsed.data as any;
  const adminId = req.admin!.adminId;

  if (status === "active" && (!participants || participants.length < 2) && (!votings || votings.length === 0)) {
    // For top-level event with votings, the parent itself may have 0 participants — votings hold them.
    // Only require participants if no votings are supplied.
    throw new ApiError(400, "VALIDATION_ERROR", "Активное мероприятие должно иметь минимум двух участников");
  }
  if (votings) {
    for (const v of votings as any[]) {
      if (v.status === "active" && (!v.participants || v.participants.length < 2)) {
        throw new ApiError(400, "VALIDATION_ERROR", `Активное голосование "${v.title}" должно иметь минимум двух участников`);
      }
    }
  }

  let previousActiveId: number | null = null;
  const event = await withTransaction(async (client) => {
    // Top-level single active invariant — only for parent_event_id IS NULL
    if (status === "active") {
      const previous = await client.query<{ id: number }>(
        "SELECT id FROM events WHERE status = 'active' AND parent_event_id IS NULL FOR UPDATE"
      );
      previousActiveId = previous.rows[0]?.id ?? null;
      await client.query(`UPDATE events SET status = 'completed' WHERE status = 'active' AND parent_event_id IS NULL`);
    }

    const cleanedCustomLabel = eventType === "other" ? (customTypeLabel?.trim() || null) : null;
    const inserted = await client.query<EventRecord>(
      `INSERT INTO events (
         title, status, event_type, custom_type_label, date_time, voting_duration_minutes, voting_started_at, votes_hidden, hidden_from_public, show_leaderboard, show_standings, show_podium, broadcast_message, parent_event_id, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $2 = 'active' THEN now() ELSE NULL END, $7, $8, $9, $10, $11, $12, NULL, $13)
       RETURNING *`,
      [title, status, eventType ?? "debate", cleanedCustomLabel, dateTime, votingDurationMinutes ?? null, votesHidden ?? false, hiddenFromPublic ?? false, showLeaderboard ?? true, showStandings ?? true, showPodium ?? true, broadcastMessage?.trim() || null, adminId]
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

    if (votings && (votings as any[]).length > 0) {
      for (const v of votings as any[]) {
        const vCleanLabel = v.eventType === "other" ? (v.customTypeLabel?.trim() || null) : null;
        const vDateTime = v.dateTime ?? dateTime;
        const vStatus = v.status ?? "upcoming";
        const insertedVoting = await client.query<EventRecord>(
          `INSERT INTO events (
             title, status, event_type, custom_type_label, date_time, voting_duration_minutes, voting_started_at, votes_hidden, hidden_from_public, show_leaderboard, show_standings, show_podium, broadcast_message, parent_event_id, created_by
           )
           VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $2 = 'active' THEN now() ELSE NULL END, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING *`,
          [v.title, vStatus, v.eventType ?? "poll", vCleanLabel, vDateTime, v.votingDurationMinutes ?? null, v.votesHidden ?? false, v.hiddenFromPublic ?? false, v.showLeaderboard ?? true, v.showStandings ?? true, v.showPodium ?? true, v.broadcastMessage?.trim() || null, inserted.rows[0].id, adminId]
        );
        if (v.participants) {
          for (const vp of v.participants as any[]) {
            await client.query(
              `INSERT INTO participants (event_id, name, description) VALUES ($1, $2, $3)`,
              [insertedVoting.rows[0].id, vp.name, vp.description ?? null]
            );
          }
        }
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

  // only top-level events (parent_event_id IS NULL); child votings are fetched separately
  const parentFilter = "e.parent_event_id IS NULL";
  const combinedWhere = whereClause ? `${whereClause} AND ${parentFilter}` : `WHERE ${parentFilter}`;
  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM events e ${combinedWhere}`,
    values
  );

  values.push(limit, offset);
  const itemsResult = await pool.query<EventRecord & { participants_count: string; votings_count: string }>(
    `SELECT e.*, COUNT(DISTINCT p.id)::text AS participants_count, COUNT(DISTINCT v.id)::text AS votings_count
     FROM events e
     LEFT JOIN participants p ON p.event_id = e.id
     LEFT JOIN events v ON v.parent_event_id = e.id
     ${combinedWhere}
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

  const votingsResult = await pool.query<EventRecord>(
    `SELECT * FROM events WHERE parent_event_id = $1 ORDER BY date_time ASC, id ASC`,
    [eventId]
  );
  const votings = votingsResult.rows.map(serializeEvent);

  res.status(200).json({
    event: serializeEvent(eventResult.rows[0]),
    participants: participantsResult.rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      votesCount: p.votes_count,
    })),
    votings,
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
  const { title, dateTime, status, eventType, customTypeLabel, votingDurationMinutes, votesHidden, hiddenFromPublic, showLeaderboard, showStandings, showPodium, broadcastMessage } = parsed.data;

  if (
    title === undefined &&
    dateTime === undefined &&
    status === undefined &&
    eventType === undefined &&
    customTypeLabel === undefined &&
    votingDurationMinutes === undefined &&
    votesHidden === undefined &&
    hiddenFromPublic === undefined &&
    showLeaderboard === undefined &&
    showStandings === undefined &&
    showPodium === undefined &&
    broadcastMessage === undefined
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "Нет полей для обновления");
  }

  let previousActiveId: number | null = null;
  let previousVotesHidden: boolean | null = null;
  let previousHiddenFromPublic: boolean | null = null;
  let previousBroadcastMessage: string | null | undefined = undefined;
  const updatedEvent = await withTransaction(async (client) => {
    const existing = await client.query<EventRecord>(
      "SELECT * FROM events WHERE id = $1 FOR UPDATE",
      [eventId]
    );
    if (existing.rowCount === 0) {
      throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");
    }
    previousVotesHidden = Boolean(existing.rows[0].votes_hidden);
    previousHiddenFromPublic = Boolean(existing.rows[0].hidden_from_public);
    previousBroadcastMessage = (existing.rows[0] as any).broadcast_message ?? null;

    const isTopLevel = (existing.rows[0] as any).parent_event_id == null;
    if (status === "active") {
      // For child votings we allow multiple active, for top-level we enforce single active
      const participantsCount = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM participants WHERE event_id = $1",
        [eventId]
      );
      // Also check child votings count if parent has no direct participants but has votings
      const needParticipants = Number(participantsCount.rows[0].count) < 2;
      if (needParticipants) {
        const votingsCount = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM events WHERE parent_event_id = $1",
          [eventId]
        );
        if (Number(votingsCount.rows[0].count) === 0) {
          throw new ApiError(400, "VALIDATION_ERROR", "Активное мероприятие должно иметь минимум двух участников");
        }
        // if has votings, parent can be active even without direct participants
      } else if (Number(participantsCount.rows[0].count) < 2) {
        throw new ApiError(400, "VALIDATION_ERROR", "Активное мероприятие должно иметь минимум двух участников");
      }
      if (isTopLevel) {
        const previous = await client.query<{ id: number }>(
          "SELECT id FROM events WHERE status = 'active' AND parent_event_id IS NULL AND id <> $1 FOR UPDATE",
          [eventId]
        );
        previousActiveId = previous.rows[0]?.id ?? null;
        await client.query(
          `UPDATE events SET status = 'completed' WHERE status = 'active' AND parent_event_id IS NULL AND id <> $1`,
          [eventId]
        );
      }
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
    if (eventType !== undefined) {
      values.push(eventType);
      setClauses.push(`event_type = $${values.length}`);
    }
    if (customTypeLabel !== undefined) {
      const cleaned = eventType === "other" || (eventType === undefined && (existing.rows[0] as any).event_type === "other") ? (customTypeLabel?.trim() || null) : null;
      // если меняем на other без лейбла — очищаем, если меняем с other на другой тип — тоже очищаем
      const finalLabel = eventType !== undefined ? (eventType === "other" ? (customTypeLabel?.trim() || null) : null) : (customTypeLabel?.trim() || null);
      values.push(finalLabel);
      setClauses.push(`custom_type_label = $${values.length}`);
    }
    if (showLeaderboard !== undefined) {
      values.push(showLeaderboard);
      setClauses.push(`show_leaderboard = $${values.length}`);
    }
    if (showStandings !== undefined) {
      values.push(showStandings);
      setClauses.push(`show_standings = $${values.length}`);
    }
    if (showPodium !== undefined) {
      values.push(showPodium);
      setClauses.push(`show_podium = $${values.length}`);
    }
    if (broadcastMessage !== undefined) {
      values.push(broadcastMessage?.trim() || null);
      setClauses.push(`broadcast_message = $${values.length}`);
    }
    // Если переключили тип с "other" на любой другой — чистим кастомный лейбл, даже если он не прислан
    if (eventType !== undefined && eventType !== "other" && customTypeLabel === undefined) {
      values.push(null);
      setClauses.push(`custom_type_label = $${values.length}`);
    }
    if (votingDurationMinutes !== undefined) {
      values.push(votingDurationMinutes);
      setClauses.push(`voting_duration_minutes = $${values.length}`);
    }
    if (votesHidden !== undefined) {
      values.push(votesHidden);
      setClauses.push(`votes_hidden = $${values.length}`);
    }
    if (hiddenFromPublic !== undefined) {
      values.push(hiddenFromPublic);
      setClauses.push(`hidden_from_public = $${values.length}`);
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

  // Переключили «Скрыть голоса»: рассылаем подписчикам дебата актуальные
  // результаты (занулённые при скрытии, настоящие при раскрытии) и сам флаг.
  // Цифры уходят РАНЬШЕ флага: тогда экран трансляции, увидев «раскрыть»,
  // уже держит корректные результаты и сразу запускает показ итогов.
  if (votesHidden !== undefined && previousVotesHidden !== null && votesHidden !== previousVotesHidden) {
    const visibilityClient = await pool.connect();
    try {
      const results = await computeEventResults(visibilityClient, eventId);
      broadcastVoteUpdate(votesHidden ? redactEventResults(results) : results);
      broadcastVoteVisibilityChanged(eventId, votesHidden);
    } finally {
      visibilityClient.release();
    }
  }

  // Переключили «Скрыть от публики»: подписчики дебата сразу видят результат
  // (страница обычного пользователя укрывается, при раскрытии — подгружается).
  if (
    hiddenFromPublic !== undefined &&
    previousHiddenFromPublic !== null &&
    hiddenFromPublic !== previousHiddenFromPublic
  ) {
    broadcastPublicVisibilityChanged(eventId, hiddenFromPublic);
  }

  if (broadcastMessage !== undefined && broadcastMessage?.trim() !== (previousBroadcastMessage ?? "")) {
    broadcastBroadcastMessageChanged(eventId, broadcastMessage?.trim() || null);
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
 * POST /api/admin/events/:id/votings — create a voting (child event) under parent event
 */
export const createVoting = asyncHandler(async (req: Request, res: Response) => {
  const parentId = parseInt(req.params.id, 10);
  if (Number.isNaN(parentId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  }
  const parsed = createVotingSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  }
  const data = parsed.data as any;
  if (data.status === "active" && (!data.participants || data.participants.length < 2)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Активное голосование должно иметь минимум двух участников");
  }
  const parentCheck = await pool.query<EventRecord>("SELECT * FROM events WHERE id = $1", [parentId]);
  if (parentCheck.rowCount === 0) {
    throw new ApiError(404, "EVENT_NOT_FOUND", "Родительское мероприятие не найдено");
  }
  if ((parentCheck.rows[0] as any).parent_event_id != null) {
    throw new ApiError(400, "VALIDATION_ERROR", "Нельзя создавать голосование внутри голосования");
  }
  const adminId = req.admin!.adminId;
  const voting = await withTransaction(async (client) => {
    const cleanedLabel = data.eventType === "other" ? (data.customTypeLabel?.trim() || null) : null;
    const vDateTime = data.dateTime ?? (parentCheck.rows[0] as any).date_time.toISOString();
    const inserted = await client.query<EventRecord>(
      `INSERT INTO events (title, status, event_type, custom_type_label, date_time, voting_duration_minutes, voting_started_at, votes_hidden, hidden_from_public, show_leaderboard, show_standings, show_podium, broadcast_message, parent_event_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $2='active' THEN now() ELSE NULL END, $7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [data.title, data.status ?? "upcoming", data.eventType ?? "poll", cleanedLabel, vDateTime, data.votingDurationMinutes ?? null, data.votesHidden ?? false, data.hiddenFromPublic ?? false, data.showLeaderboard ?? true, data.showStandings ?? true, data.showPodium ?? true, data.broadcastMessage?.trim() || null, parentId, adminId]
    );
    if (data.participants) {
      for (const p of data.participants as any[]) {
        await client.query(`INSERT INTO participants (event_id, name, description) VALUES ($1,$2,$3)`, [inserted.rows[0].id, p.name, p.description ?? null]);
      }
    }
    return inserted.rows[0];
  });
  const participantsCount = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM participants WHERE event_id=$1", [voting.id]);
  res.status(201).json({ voting: { ...serializeEvent(voting), participantsCount: Number(participantsCount.rows[0].count) } });
});

/**
 * GET /api/admin/events/:id/votings — list votings for parent event
 */
export const listVotings = asyncHandler(async (req: Request, res: Response) => {
  const parentId = parseInt(req.params.id, 10);
  if (Number.isNaN(parentId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  }
  const rows = await pool.query<EventRecord & { participants_count: string }>(
    `SELECT e.*, COUNT(p.id)::text AS participants_count FROM events e LEFT JOIN participants p ON p.event_id = e.id WHERE e.parent_event_id = $1 GROUP BY e.id ORDER BY e.date_time ASC, e.id ASC`,
    [parentId]
  );
  res.status(200).json({ votings: rows.rows.map(serializeEvent) });
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
