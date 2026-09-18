import { Request, Response } from "express";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";

async function computeLeaderboard(eventId: number) {
  const eventResult = await pool.query("SELECT id, event_type FROM events WHERE id = ?", [eventId]);
  if (eventResult.rowCount === 0) throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");
  const eventType = (eventResult.rows[0] as any).event_type;

  // Для турниров — берём очки из standings
  if (eventType === "tournament") {
    const standings = await pool.query(
      `SELECT s.participant_id, s.points AS score, s.position, p.name, p.description
       FROM tournament_standings s JOIN participants p ON p.id = s.participant_id
       WHERE s.event_id = ? ORDER BY s.points DESC, s.wins DESC`,
      [eventId]
    );
    // Если standings пусты, считаем по голосам как fallback
    if (standings.rowCount === 0) {
      const fallback = await pool.query(
        `SELECT p.id AS participant_id, p.name, p.description, COUNT(v.id) AS score
         FROM participants p LEFT JOIN votes v ON v.participant_id = p.id
         WHERE p.event_id = ? GROUP BY p.id ORDER BY score DESC`,
        [eventId]
      );
      let rank = 1;
      return fallback.rows.map((r: any) => ({ participantId: r.participant_id, name: r.name, description: r.description, score: Number(r.score), rank: rank++ }));
    }
    let lastScore: number | null = null;
    let lastRank = 0;
    return standings.rows.map((r: any, idx: number) => {
      const score = Number(r.score);
      const rank = lastScore !== null && score === lastScore ? lastRank : idx + 1;
      lastScore = score;
      lastRank = rank;
      return { participantId: r.participant_id, name: r.name, description: r.description, score, rank };
    });
  }

  // Для остальных типов — по голосам
  const result = await pool.query(
    `SELECT p.id AS participant_id, p.name, p.description, COUNT(v.id) AS score
     FROM participants p LEFT JOIN votes v ON v.participant_id = p.id
     WHERE p.event_id = ? GROUP BY p.id ORDER BY score DESC, p.id ASC`,
    [eventId]
  );
  let lastScore: number | null = null;
  let lastRank = 0;
  return result.rows.map((r: any, idx: number) => {
    const score = Number(r.score);
    const rank = lastScore !== null && score === lastScore ? lastRank : idx + 1;
    lastScore = score;
    lastRank = rank;
    return { participantId: r.participant_id, name: r.name, description: r.description, score, rank };
  });
}

export const getLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  const items = await computeLeaderboard(eventId);
  res.status(200).json({ eventId, items });
});

export const getPodium = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  // Сначала пробуем из таблицы podiums
  const stored = await pool.query(
    `SELECT po.place, po.participant_id, p.name, p.description FROM podiums po JOIN participants p ON p.id = po.participant_id WHERE po.event_id = ? ORDER BY po.place ASC`,
    [eventId]
  );
  if (stored.rowCount > 0) {
    return res.status(200).json({ eventId, podium: stored.rows.map((r: any) => ({ place: r.place, participantId: r.participant_id, name: r.name, description: r.description })) });
  }
  // Иначе вычисляем топ-3 из лидерборда
  const leaderboard = await computeLeaderboard(eventId);
  const podium = leaderboard.slice(0, 3).map((item, idx) => ({ place: idx + 1, participantId: item.participantId, name: item.name, description: item.description, score: item.score }));
  res.status(200).json({ eventId, podium });
});

export const setPodium = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  const { auto } = req.query;
  // auto=true — пересчитать пьедестал по текущим результатам
  if (auto === "true") {
    const leaderboard = await computeLeaderboard(eventId);
    await pool.query("DELETE FROM podiums WHERE event_id = ?", [eventId]);
    for (let i = 0; i < Math.min(3, leaderboard.length); i++) {
      await pool.query("INSERT INTO podiums (event_id, participant_id, place) VALUES (?, ?, ?)", [eventId, leaderboard[i].participantId, i + 1]);
    }
    const stored = await pool.query(
      `SELECT po.place, po.participant_id, p.name, p.description FROM podiums po JOIN participants p ON p.id = po.participant_id WHERE po.event_id = ? ORDER BY po.place ASC`,
      [eventId]
    );
    return res.status(200).json({ eventId, podium: stored.rows });
  }

  // Ручное задание пьедестала: body = { podium: [{place:1, participantId:5}, ...] }
  const podium: Array<{ place: number; participantId: number }> = req.body?.podium;
  if (!Array.isArray(podium) || podium.length === 0) throw new ApiError(400, "VALIDATION_ERROR", "Некорректный формат пьедестала");
  await pool.query("DELETE FROM podiums WHERE event_id = ?", [eventId]);
  for (const item of podium) {
    if (![1, 2, 3].includes(item.place)) throw new ApiError(400, "VALIDATION_ERROR", "place должен быть 1,2 или 3");
    await pool.query("INSERT INTO podiums (event_id, participant_id, place) VALUES (?, ?, ?)", [eventId, item.participantId, item.place]);
  }
  const stored = await pool.query(
    `SELECT po.place, po.participant_id, p.name, p.description FROM podiums po JOIN participants p ON p.id = po.participant_id WHERE po.event_id = ? ORDER BY po.place ASC`,
    [eventId]
  );
  res.status(200).json({ eventId, podium: stored.rows });
});

// Экспортируем для использования после голосования
export async function refreshLeaderboardCache(_eventId: number): Promise<void> {
  // Плейсхолдер — сейчас leaderboard считается на лету, кэш не нужен
  // Но можно добавить инвалидацию если введём кэш
}
