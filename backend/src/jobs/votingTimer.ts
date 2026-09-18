import { pool } from "../config/db";
import { broadcastEventStatusChanged } from "../sockets";

/**
 * Фоновый таймер голосования.
 *
 * Раз в intervalMs ищет активные события, у которых интервал
 * «время запуска + длительность» уже истёк, переводит их в «completed»
 * и рассылает всем клиентам дебата событие смены статуса — так голосование
 * останавливается само по себе, без участия администратора:
 *   - фронтенд получает `event:status_changed` и блокирует кнопку «Голосовать»;
 *   - REST-эндпоинт голоса дополнительно отклоняет запрос (409 VOTING_CLOSED).
 */
export function startVotingTimer(intervalMs = 15_000): () => void {
  let running = false;

  const sweep = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await pool.query<{ id: number }>(
        `UPDATE events
         SET status = 'completed'
         WHERE status = 'active'
           AND voting_duration_minutes IS NOT NULL
           AND datetime(COALESCE(voting_started_at, date_time), '+' || voting_duration_minutes || ' minutes') <= strftime('%Y-%m-%dT%H:%M:%SZ','now')
         RETURNING id`
      );
      for (const row of result.rows) {
        // eslint-disable-next-line no-console
        console.log(`[voting-timer] событие ${row.id}: таймер истёк, голосование закрыто`);
        broadcastEventStatusChanged(row.id, "completed");
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[voting-timer] сбой проверки таймеров:", error);
    } finally {
      running = false;
    }
  };

  // Проверяем сразу после старта, чтобы подхватить события, чей таймер
  // истёк, пока сервер стоял.
  void sweep();
  const timer = setInterval(() => void sweep(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
