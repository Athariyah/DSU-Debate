/**
 * Таймер голосования: расчёт дедлайна по длительности события.
 * Дедлайн = дата_время события + voting_duration_minutes (если задана).
 */

interface VotingWindowRow {
  date_time: Date;
  voting_duration_minutes: number | null;
}

/** Дедлайн голосования или null, если таймер выключен. */
export function votingEndsAt(row: VotingWindowRow): Date | null {
  if (row.voting_duration_minutes == null) return null;
  return new Date(row.date_time.getTime() + row.voting_duration_minutes * 60_000);
}

/** Открыто ли голосование по таймеру (статус проверяет вызывающий код). */
export function isVotingWindowOpen(row: VotingWindowRow, now: Date = new Date()): boolean {
  const ends = votingEndsAt(row);
  return ends === null || now.getTime() < ends.getTime();
}
