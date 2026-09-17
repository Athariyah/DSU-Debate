import { Request, Response } from "express";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import { recalcTournamentStandings } from "./matches.controller";

export const getStandings = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  // Ensure event exists
  const ev = await pool.query("SELECT id, event_type, status FROM events WHERE id = ?", [eventId]);
  if (ev.rowCount === 0) throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");

  // Auto-recalc if standings empty but matches exist
  const existing = await pool.query("SELECT * FROM tournament_standings WHERE event_id = ? ORDER BY position ASC", [eventId]);
  if (existing.rowCount === 0) {
    const matches = await pool.query("SELECT id FROM matches WHERE event_id = ? LIMIT 1", [eventId]);
    if (matches.rowCount > 0) {
      await recalcTournamentStandings(eventId);
      const recalc = await pool.query("SELECT * FROM tournament_standings WHERE event_id = ? ORDER BY position ASC", [eventId]);
      // Join with participants for name
      const enriched = await pool.query(
        `SELECT s.*, p.name, p.description FROM tournament_standings s JOIN participants p ON p.id = s.participant_id WHERE s.event_id = ? ORDER BY s.position ASC`,
        [eventId]
      );
      return res.status(200).json({ items: enriched.rows });
    }
  }

  const enriched = await pool.query(
    `SELECT s.*, p.name, p.description FROM tournament_standings s JOIN participants p ON p.id = s.participant_id WHERE s.event_id = ? ORDER BY s.position ASC`,
    [eventId]
  );
  res.status(200).json({ items: enriched.rows });
});

export const refreshStandings = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  await recalcTournamentStandings(eventId);
  const enriched = await pool.query(
    `SELECT s.*, p.name, p.description FROM tournament_standings s JOIN participants p ON p.id = s.participant_id WHERE s.event_id = ? ORDER BY s.position ASC`,
    [eventId]
  );
  res.status(200).json({ items: enriched.rows });
});
