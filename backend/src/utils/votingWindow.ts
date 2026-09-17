/**
 * Таймер голосования: расчёт дедлайна по длительности активного дебата.
 * Дедлайн = время запуска голосования + voting_duration_minutes (если задана).
 */

interface VotingWindowRow {
  date_time: Date;
  voting_duration_minutes: number | null;
  /** Время фактического запуска голосования (для старых строк может отсутствовать). */
  voting_started_at?: Date | null;
}

/**
 * Дедлайн голосования или null, если таймер выключен.
 *
 * Длительность отсчитывается от фактического перевода дебата в `active`, а
 * не от запланированного времени. Иначе администратор, включив дебат позже
 * расписания, получал бы на экране уже истёкший или слишком длинный таймер.
 * Для записей, созданных до появления `voting_started_at`, оставляем
 * совместимость и используем `date_time` как прежнюю точку отсчёта.
 */
export function votingEndsAt(row: VotingWindowRow): Date | null {
  if (row.voting_duration_minutes == null) return null;
  const start = row.voting_started_at ?? row.date_time;
  return new Date(start.getTime() + row.voting_duration_minutes * 60_000);
}

/** Открыто ли голосование по таймеру (статус проверяет вызывающий код). */
export function isVotingWindowOpen(row: VotingWindowRow, now: Date = new Date()): boolean {
  const ends = votingEndsAt(row);
  return ends === null || now.getTime() < ends.getTime();
}
