-- ===========================================================================
-- 003 — Таймер голосования.
-- Добавляет опциональную длительность голосования (в минутах) в события.
-- Пока время запуска + длительность не прошли — голосование открыто; после —
-- бэкенд сам переводит событие в «completed» (см. jobs/votingTimer.ts), а
-- эндпоинт голосования отклоняет новые голоса.
-- ===========================================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS voting_duration_minutes INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_events_voting_duration_positive'
  ) THEN
    ALTER TABLE events
      ADD CONSTRAINT chk_events_voting_duration_positive
      CHECK (voting_duration_minutes IS NULL OR voting_duration_minutes >= 1);
  END IF;
END$$;

COMMENT ON COLUMN events.voting_duration_minutes IS
  'Длительность голосования в минутах (NULL — таймер выключен). После истечения '
  'интервала от фактического запуска + длительность голосование закрывается автоматически.';
