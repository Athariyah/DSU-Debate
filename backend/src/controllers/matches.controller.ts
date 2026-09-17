import { Request, Response } from "express";
import { pool, withTransaction } from "../config/db";
import { MatchRecord } from "../types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import { createMatchSchema, updateMatchSchema } from "../validation/schemas";
import { broadcastMatchUpdate, broadcastStandingsUpdate } from "../sockets";

function serializeMatch(row: MatchRecord) {
  return {
    id: row.id,
    eventId: row.event_id,
    round: row.round,
    participant1Id: row.participant1_id,
    participant2Id: row.participant2_id,
    winnerId: row.winner_id,
    score1: row.score1,
    score2: row.score2,
    status: row.status,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Вспомогательная: пересчёт турнирной таблицы по матчам
export async function recalcTournamentStandings(eventId: number): Promise<void> {
  const participants = await pool.query<{ id: number }>("SELECT id FROM participants WHERE event_id = ?", [eventId]);
  const standingsMap = new Map<number, { wins: number; losses: number; draws: number; points: number }>();
  for (const p of participants.rows) standingsMap.set(p.id, { wins: 0, losses: 0, draws: 0, points: 0 });

  const matches = await pool.query<MatchRecord>("SELECT * FROM matches WHERE event_id = ? AND status IN ('completed','draw')", [eventId]);
  for (const m of matches.rows) {
    const p1 = standingsMap.get(m.participant1_id);
    const p2 = standingsMap.get(m.participant2_id);
    if (!p1 || !p2) continue;
    if (m.status === "draw") {
      p1.draws += 1;
      p2.draws += 1;
      p1.points += 1;
      p2.points += 1;
    } else if (m.winner_id === m.participant1_id) {
      p1.wins += 1;
      p2.losses += 1;
      p1.points += 3;
    } else if (m.winner_id === m.participant2_id) {
      p2.wins += 1;
      p1.losses += 1;
      p2.points += 3;
    }
  }

  // Сортируем по очкам и обновляем таблицу
  const sorted = Array.from(standingsMap.entries())
    .map(([pid, s]) => ({ participantId: pid, ...s }))
    .sort((a, b) => b.points - a.points || b.wins - a.wins);

  await withTransaction(async (client) => {
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const position = i + 1;
      await client.query(
        `INSERT INTO tournament_standings (event_id, participant_id, wins, losses, draws, points, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_id, participant_id) DO UPDATE SET wins=excluded.wins, losses=excluded.losses, draws=excluded.draws, points=excluded.points, position=excluded.position, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
        [eventId, s.participantId, s.wins, s.losses, s.draws, s.points, position]
      );
    }
  });
}

export const listMatches = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  const result = await pool.query<MatchRecord>("SELECT * FROM matches WHERE event_id = ? ORDER BY round ASC, id ASC", [eventId]);
  res.status(200).json({ items: result.rows.map(serializeMatch) });
});

export const getMatchById = asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.matchId, 10);
  if (Number.isNaN(id)) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id матча");
  const result = await pool.query<MatchRecord>("SELECT * FROM matches WHERE id = ?", [id]);
  if (result.rowCount === 0) throw new ApiError(404, "MATCH_NOT_FOUND", "Матч не найден");
  res.status(200).json({ match: serializeMatch(result.rows[0]) });
});

export const createMatch = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  const parsed = createMatchSchema.safeParse({ ...req.body, eventId });
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  const { round, participant1Id, participant2Id, winnerId, score1, score2, status, scheduledAt } = parsed.data;

  if (participant1Id === participant2Id) throw new ApiError(400, "VALIDATION_ERROR", "Участники матча должны быть разными");

  // Проверяем что событие существует и тип tournament или разрешаем для любых?
  const eventResult = await pool.query("SELECT id, event_type FROM events WHERE id = ?", [eventId]);
  if (eventResult.rowCount === 0) throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");

  // Проверяем что участники принадлежат событию
  const pCheck = await pool.query<{ count: number }>("SELECT COUNT(*) AS count FROM participants WHERE event_id = ? AND id IN (?, ?)", [eventId, participant1Id, participant2Id]);
  if (Number((pCheck.rows[0] as any).count) !== 2) throw new ApiError(404, "PARTICIPANT_NOT_FOUND", "Участники не найдены в данном мероприятии");

  if (winnerId && winnerId !== participant1Id && winnerId !== participant2Id) {
    throw new ApiError(400, "VALIDATION_ERROR", "Победитель должен быть одним из участников матча");
  }

  const inserted = await pool.query<MatchRecord>(
    `INSERT INTO matches (event_id, round, participant1_id, participant2_id, winner_id, score1, score2, status, scheduled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    [eventId, round, participant1Id, participant2Id, winnerId ?? null, score1, score2, status, scheduledAt ?? null]
  );
  const match = inserted.rows[0];
  // Пересчёт standings
  await recalcTournamentStandings(eventId);
  broadcastMatchUpdate(eventId, serializeMatch(match));
  // Транслируем обновлённую таблицу
  const standings = await pool.query("SELECT * FROM tournament_standings WHERE event_id = ? ORDER BY position ASC", [eventId]);
  broadcastStandingsUpdate(eventId, standings.rows);

  res.status(201).json({ match: serializeMatch(match) });
});

export const updateMatch = asyncHandler(async (req: Request, res: Response) => {
  const matchId = parseInt(req.params.matchId, 10);
  if (Number.isNaN(matchId)) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id матча");
  const parsed = updateMatchSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0].message);

  const existing = await pool.query<MatchRecord>("SELECT * FROM matches WHERE id = ?", [matchId]);
  if (existing.rowCount === 0) throw new ApiError(404, "MATCH_NOT_FOUND", "Матч не найден");
  const eventId = existing.rows[0].event_id;

  const updates: string[] = [];
  const values: unknown[] = [];
  const data = parsed.data as any;
  if (data.round !== undefined) { values.push(data.round); updates.push(`round = ?`); }
  if (data.participant1Id !== undefined) { values.push(data.participant1Id); updates.push(`participant1_id = ?`); }
  if (data.participant2Id !== undefined) { values.push(data.participant2Id); updates.push(`participant2_id = ?`); }
  if (data.winnerId !== undefined) { values.push(data.winnerId); updates.push(`winner_id = ?`); }
  if (data.score1 !== undefined) { values.push(data.score1); updates.push(`score1 = ?`); }
  if (data.score2 !== undefined) { values.push(data.score2); updates.push(`score2 = ?`); }
  if (data.status !== undefined) { values.push(data.status); updates.push(`status = ?`); }
  if (data.scheduledAt !== undefined) { values.push(data.scheduledAt); updates.push(`scheduled_at = ?`); }

  if (updates.length === 0) throw new ApiError(400, "VALIDATION_ERROR", "Нет полей для обновления");

  values.push(matchId);
  const updated = await pool.query<MatchRecord>(`UPDATE matches SET ${updates.join(", ")}, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ? RETURNING *`, values);
  const match = updated.rows[0];

  await recalcTournamentStandings(eventId);
  broadcastMatchUpdate(eventId, serializeMatch(match));
  const standings = await pool.query("SELECT * FROM tournament_standings WHERE event_id = ? ORDER BY position ASC", [eventId]);
  broadcastStandingsUpdate(eventId, standings.rows);

  res.status(200).json({ match: serializeMatch(match) });
});

export const deleteMatch = asyncHandler(async (req: Request, res: Response) => {
  const matchId = parseInt(req.params.matchId, 10);
  if (Number.isNaN(matchId)) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id матча");
  const existing = await pool.query<MatchRecord>("SELECT * FROM matches WHERE id = ?", [matchId]);
  if (existing.rowCount === 0) throw new ApiError(404, "MATCH_NOT_FOUND", "Матч не найден");
  const eventId = existing.rows[0].event_id;
  await pool.query("DELETE FROM matches WHERE id = ?", [matchId]);
  await recalcTournamentStandings(eventId);
  const standings = await pool.query("SELECT * FROM tournament_standings WHERE event_id = ? ORDER BY position ASC", [eventId]);
  broadcastStandingsUpdate(eventId, standings.rows);
  res.status(204).send();
});
