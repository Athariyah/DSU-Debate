import { Request, Response } from "express";
import { isIP } from "node:net";
import { pool, withTransaction, PoolClient } from "../config/db";
import { EventRecord, EventResults, ParticipantResult } from "../types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import { castVoteSchema } from "../validation/schemas";
import { broadcastLeaderboardUpdate, broadcastPodiumUpdate, broadcastVoteUpdate } from "../sockets";
import { isVotingWindowOpen, votingEndsAt } from "../utils/votingWindow";
import { eventResultsCache, leaderboardCache } from "../utils/cache";

/**
 * Извлекает реальный IP-адрес клиента из запроса.
 * Учитывает работу за обратным прокси (nginx / load balancer):
 * Express сам вычисляет req.ip с учётом ограниченного количества доверенных
 * прокси (`TRUST_PROXY`). Приложение не читает X-Forwarded-For напрямую от клиента.
 */
function extractClientIp(req: Request): string {
  // Express resolves X-Forwarded-For only through the configured trusted proxy
  // count. Never trust a client-supplied header directly.
  const rawIp = req.ip ?? req.socket.remoteAddress ?? "0.0.0.0";
  const normalized = rawIp.startsWith("::ffff:") ? rawIp.slice("::ffff:".length) : rawIp;
  return isIP(normalized) ? normalized : "0.0.0.0";
}

/**
 * Считает голоса по всем участникам мероприятия внутри уже открытой транзакции
 * и возвращает готовую структуру с процентами (округлёнными до 1 знака).
 * LEFT JOIN гарантирует, что участники без единого голоса тоже попадут
 * в выдачу с процентом 0, а не будут "проглочены" агрегацией.
 */
export async function computeEventResults(
  client: PoolClient,
  eventId: number
): Promise<EventResults> {
  // Кэш для чтения вне транзакции — ускоряет повторные запросы трансляции
  // Внутри транзакции голоса кэш не используется, чтобы не отдать устаревшие данные
  const aggregation = await client.query<{
    id: number;
    name: string;
    description: string | null;
    votes_count: string;
  }>(
    `SELECT p.id, p.name, p.description, COUNT(v.id) AS votes_count
     FROM participants p
     LEFT JOIN votes v ON v.participant_id = p.id
     WHERE p.event_id = $1
     GROUP BY p.id, p.name, p.description
     ORDER BY p.id ASC`,
    [eventId]
  );

  const rows = aggregation.rows.map((row) => ({
    participantId: row.id,
    name: row.name,
    description: row.description,
    votesCount: Number(row.votes_count),
  }));

  const totalVotes = rows.reduce((sum, row) => sum + row.votesCount, 0);

  const participants: ParticipantResult[] = rows.map((row) => ({
    participantId: row.participantId,
    name: row.name,
    description: row.description,
    votesCount: row.votesCount,
    percentage:
      totalVotes === 0
        ? 0
        : Math.round((row.votesCount / totalVotes) * 1000) / 10, // 1 знак после запятой
  }));

  return { eventId, totalVotes, participants };
}

/**
 * Занулённые результаты для закрытого голосования (флажок «Скрыть голоса»).
 * Структура данных сохраняется — участники, их порядок и количество — но все
 * цифры обнулены: зрителям нельзя слать расклад ни по HTTP-ответам, ни по
 * realtime-трафику, а интерфейс показывает плашку «результаты скрыты».
 */
export function redactEventResults(results: EventResults): EventResults {
  return {
    eventId: results.eventId,
    totalVotes: 0,
    participants: results.participants.map((participant) => ({
      ...participant,
      votesCount: 0,
      percentage: 0,
    })),
  };
}

/**
 * GET /api/events/active
 * Возвращает текущий активный дебат вместе с участниками и live-результатами.
 */
export const getActiveEvent = asyncHandler(async (_req: Request, res: Response) => {
  // Скрытые от публики дебаты не показываем даже как «активный»:
  // для обычных пользователей их просто нет.
  const eventResult = await pool.query<EventRecord>(
    `SELECT * FROM events
     WHERE status = 'active' AND COALESCE(hidden_from_public, FALSE) = FALSE
     ORDER BY date_time DESC LIMIT 1`
  );

  if (eventResult.rowCount === 0) {
    throw new ApiError(404, "NO_ACTIVE_EVENT", "Сейчас нет активного мероприятия");
  }

  const event = eventResult.rows[0];
  const client = await pool.connect();
  let results: EventResults;
  try {
    results = await computeEventResults(client, event.id);
  } finally {
    client.release();
  }

  // Закрытое голосование: цифры не покидают сервер — зрителю уходят
  // занулённые результаты и флаг votesHidden для плашки «скрыто».
  const votesHidden = Boolean(event.votes_hidden);
  const visibleResults = votesHidden ? redactEventResults(results) : results;

  res.status(200).json({
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      eventType: (event as any).event_type ?? (event as any).eventType ?? "debate",
      customTypeLabel: (event as any).custom_type_label ?? null,
      dateTime: event.date_time,
      votingDurationMinutes: event.voting_duration_minutes ?? null,
      votingEndsAt: votingEndsAt(event)?.toISOString() ?? null,
      votesHidden,
      participantsCount: results.participants.length,
      showLeaderboard: (event as any).show_leaderboard === undefined || (event as any).show_leaderboard === null ? true : Boolean((event as any).show_leaderboard),
      showStandings: (event as any).show_standings === undefined || (event as any).show_standings === null ? true : Boolean((event as any).show_standings),
      showPodium: (event as any).show_podium === undefined || (event as any).show_podium === null ? true : Boolean((event as any).show_podium),
      broadcastMessage: (event as any).broadcast_message ?? null,
    },
    participants: visibleResults.participants.map((p) => ({
      id: p.participantId,
      eventId: event.id,
      name: p.name,
      description: p.description,
      votesCount: p.votesCount,
      percentage: p.percentage,
    })),
    totalVotes: visibleResults.totalVotes,
  });
});

/**
 * POST /api/events/:id/vote
 *
 * Полный цикл обработки голоса:
 *  1. Валидация входных данных (participantId, deviceFingerprint UUID).
 *  2. Определение IP клиента.
 *  3. Открытие транзакции с блокировкой строки мероприятия (FOR UPDATE),
 *     чтобы исключить гонки при одновременном голосовании множества зрителей.
 *  4. Проверка, что мероприятие существует и находится в статусе 'active'.
 *  5. Проверка, что участник принадлежит именно этому мероприятию.
 *  6. Anti-fraud проверка дубликата: тот же device_fingerprint ИЛИ тот же
 *     ip_address уже голосовали в рамках этого event_id -> 409 Conflict.
 *  7. INSERT голоса. UNIQUE constraint в БД — второй рубеж защиты на случай
 *     гонки (одновременные запросы, не увидевшие друг друга на шаге 6).
 *  8. Пересчёт голосов и процентов по ВСЕМ участникам мероприятия.
 *  9. COMMIT транзакции.
 * 10. Мгновенная трансляция новых результатов всем клиентам комнаты
 *     дебата через Socket.io (событие 'vote:update').
 * 11. HTTP-ответ голосующему с подтверждением и итоговыми результатами.
 */
export const castVote = asyncHandler(async (req: Request, res: Response) => {
  const eventId = parseInt(req.params.id, 10);
  if (Number.isNaN(eventId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Некорректный id мероприятия");
  }

  const parsed = castVoteSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  }
  const { participantId, voterName, deviceFingerprint } = parsed.data;
  const ipAddress = extractClientIp(req);

  let insertedVoteId: number | null = null;
  let insertedVoteCreatedAt: Date | null = null;
  let results: EventResults | null = null;
  let votesHidden = false;

  await withTransaction(async (client) => {
    // Блокируем строку мероприятия на время транзакции, чтобы параллельные
    // запросы на голосование по этому же event_id обрабатывались строго
    // последовательно (защита от гонок при одновременной проверке дублей).
    const eventResult = await client.query<EventRecord>(
      "SELECT * FROM events WHERE id = $1 FOR UPDATE",
      [eventId]
    );

    if (eventResult.rowCount === 0) {
      throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");
    }

    const event = eventResult.rows[0];
    votesHidden = Boolean(event.votes_hidden);

    // Скрытый от публики дебат для обычных пользователей «не существует»:
    // голосование по нему недоступно.
    if (Boolean(event.hidden_from_public)) {
      throw new ApiError(404, "EVENT_NOT_FOUND", "Мероприятие не найдено");
    }

    if (event.status !== "active") {
      throw new ApiError(
        409,
        "EVENT_NOT_ACTIVE",
        "Голосование недоступно: мероприятие сейчас не активно"
      );
    }

    // Таймер голосования: если интервал по длительности истёк — голос
    // отклоняем, даже если статус ещё не успел перевести фоновый обработчик.
    if (!isVotingWindowOpen(event)) {
      throw new ApiError(
        409,
        "VOTING_CLOSED",
        "Время голосования по этому мероприятию истекло"
      );
    }

    const participantResult = await client.query(
      "SELECT id FROM participants WHERE id = $1 AND event_id = $2",
      [participantId, eventId]
    );
    if (participantResult.rowCount === 0) {
      throw new ApiError(
        404,
        "PARTICIPANT_NOT_FOUND",
        "Участник не найден в рамках данного мероприятия"
      );
    }

    // --- ANTI-FRAUD: один голос на устройство, но разрешаем менять выбор ---
    const existingVote = await client.query<{ id: number; participant_id: number }>(
      `SELECT id, participant_id FROM votes WHERE event_id = $1 AND device_fingerprint = $2 LIMIT 1`,
      [eventId, deviceFingerprint]
    );

    if (existingVote.rowCount && existingVote.rowCount > 0) {
      const existing = existingVote.rows[0];
      if (existing.participant_id === participantId) {
        throw new ApiError(409, "DUPLICATE_VOTE", "Вы уже голосовали за этого участника");
      }
      // Меняем голос — UPDATE вместо INSERT, сохраняем 1 запись на устройство
      let updateResult;
      try {
        updateResult = await client.query<{ id: number; created_at: Date }>(
          `UPDATE votes SET participant_id = $1, voter_name = $2, ip_address = $3::inet WHERE id = $4 RETURNING id, created_at`,
          [participantId, voterName ?? null, ipAddress, existing.id]
        );
      } catch (err: unknown) {
        if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505") {
          throw new ApiError(409, "DUPLICATE_VOTE", "Вы уже голосовали в этом мероприятии");
        }
        throw err;
      }
      insertedVoteId = updateResult.rows[0].id;
      insertedVoteCreatedAt = updateResult.rows[0].created_at;
    } else {
      // --- Запись голоса. UNIQUE(event_id, device_fingerprint) — второй рубеж защиты от гонок. ---
      let insertResult;
      try {
        insertResult = await client.query<{ id: number; created_at: Date }>(
          `INSERT INTO votes (event_id, participant_id, voter_name, device_fingerprint, ip_address)
           VALUES ($1, $2, $3, $4, $5::inet)
           RETURNING id, created_at`,
          [eventId, participantId, voterName ?? null, deviceFingerprint, ipAddress]
        );
      } catch (err: unknown) {
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code?: string }).code === "23505"
        ) {
          throw new ApiError(409, "DUPLICATE_VOTE", "Вы уже голосовали в этом мероприятии");
        }
        throw err;
      }
      insertedVoteId = insertResult.rows[0].id;
      insertedVoteCreatedAt = insertResult.rows[0].created_at;
    }

    // --- Пересчёт процентов по ВСЕМ участникам этого дебата ---
    results = await computeEventResults(client, eventId);
  });

  // На этом этапе транзакция успешно закоммичена: голос сохранён,
  // результаты рассчитаны. Транслируем их всем подписчикам комнаты дебата.
  if (!results) {
    throw new ApiError(
      500,
      "INTERNAL_SERVER_ERROR",
      "Не удалось рассчитать результаты голосования"
    );
  }
  // При закрытом голосовании зрители не получают цифр ни по HTTP, ни через
  // realtime-канал — рассылаем и отвечаем занулёнными результатами.
  const payload = votesHidden ? redactEventResults(results) : results;
  broadcastVoteUpdate(payload);
  // Инвалидируем кэш агрегатов и транслируем лидерборд/пьедестал (если голос открытый)
  eventResultsCache.invalidate(eventId);
  leaderboardCache.invalidate(eventId);
  if (!votesHidden) {
    try {
      const leaderboardRows = payload.participants
        .map((p) => ({ participantId: p.participantId, name: p.name, description: p.description, score: p.votesCount }))
        .sort((a, b) => b.score - a.score);
      let rank = 1;
      let lastScore: number | null = null;
      let lastRank = 1;
      const ranked = leaderboardRows.map((r, idx) => {
        const curRank = lastScore !== null && r.score === lastScore ? lastRank : idx + 1;
        lastScore = r.score;
        lastRank = curRank;
        return { ...r, rank: curRank };
      });
      broadcastLeaderboardUpdate(eventId, { eventId, items: ranked });
      // Пьедестал — топ-3
      const podium = ranked.slice(0, 3).map((r, idx) => ({ place: idx + 1, participantId: r.participantId, name: r.name }));
      broadcastPodiumUpdate(eventId, { eventId, podium });
    } catch {}
  }

  res.status(201).json({
    success: true,
    vote: {
      id: insertedVoteId,
      participantId,
      createdAt: insertedVoteCreatedAt,
    },
    results: payload,
  });
});
