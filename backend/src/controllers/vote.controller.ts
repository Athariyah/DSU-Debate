import { Request, Response } from "express";
import { isIP } from "node:net";
import { PoolClient } from "pg";
import { pool, withTransaction } from "../config/db";
import { EventRecord, EventResults, ParticipantResult } from "../types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import { castVoteSchema } from "../validation/schemas";
import { broadcastVoteUpdate } from "../sockets";

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
  const aggregation = await client.query<{
    id: number;
    name: string;
    description: string | null;
    votes_count: string;
  }>(
    `SELECT p.id, p.name, p.description, COUNT(v.id)::text AS votes_count
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
 * GET /api/events/active
 * Возвращает текущий активный дебат вместе с участниками и live-результатами.
 */
export const getActiveEvent = asyncHandler(async (_req: Request, res: Response) => {
  const eventResult = await pool.query<EventRecord>(
    "SELECT * FROM events WHERE status = 'active' ORDER BY date_time DESC LIMIT 1"
  );

  if (eventResult.rowCount === 0) {
    throw new ApiError(404, "NO_ACTIVE_EVENT", "Сейчас нет активного дебата");
  }

  const event = eventResult.rows[0];
  const client = await pool.connect();
  let results: EventResults;
  try {
    results = await computeEventResults(client, event.id);
  } finally {
    client.release();
  }

  res.status(200).json({
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      dateTime: event.date_time,
      participantsCount: results.participants.length,
    },
    participants: results.participants.map((p) => ({
      id: p.participantId,
      eventId: event.id,
      name: p.name,
      description: p.description,
      votesCount: p.votesCount,
      percentage: p.percentage,
    })),
    totalVotes: results.totalVotes,
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
    if (event.status !== "active") {
      throw new ApiError(
        409,
        "EVENT_NOT_ACTIVE",
        "Голосование недоступно: мероприятие сейчас не активно"
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

    // --- ANTI-FRAUD: проверка дубликата по IP или device_fingerprint ---
    const duplicateResult = await client.query<{
      device_fingerprint: string;
      ip_address: string;
    }>(
      `SELECT device_fingerprint, ip_address
       FROM votes
       WHERE event_id = $1 AND (device_fingerprint = $2 OR ip_address = $3::inet)
       LIMIT 1`,
      [eventId, deviceFingerprint, ipAddress]
    );

    if (duplicateResult.rowCount && duplicateResult.rowCount > 0) {
      throw new ApiError(
        409,
        "DUPLICATE_VOTE",
        "Вы уже голосовали в этом дебате"
      );
    }

    // --- Запись голоса. UNIQUE(event_id, device_fingerprint) и
    // UNIQUE(event_id, ip_address) в БД — второй рубеж защиты от гонок. ---
    let insertResult;
    try {
      insertResult = await client.query<{ id: number; created_at: Date }>(
        `INSERT INTO votes (event_id, participant_id, voter_name, device_fingerprint, ip_address)
         VALUES ($1, $2, $3, $4, $5::inet)
         RETURNING id, created_at`,
        [eventId, participantId, voterName ?? null, deviceFingerprint, ipAddress]
      );
    } catch (err: unknown) {
      // Код 23505 = unique_violation в PostgreSQL
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        throw new ApiError(409, "DUPLICATE_VOTE", "Вы уже голосовали в этом дебате");
      }
      throw err;
    }

    insertedVoteId = insertResult.rows[0].id;
    insertedVoteCreatedAt = insertResult.rows[0].created_at;

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
  broadcastVoteUpdate(results);

  res.status(201).json({
    success: true,
    vote: {
      id: insertedVoteId,
      participantId,
      createdAt: insertedVoteCreatedAt,
    },
    results,
  });
});
