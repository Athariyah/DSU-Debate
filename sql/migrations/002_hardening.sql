-- Add cross-table integrity for votes created against an existing installation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_participants_event_id_id'
  ) THEN
    ALTER TABLE participants
      ADD CONSTRAINT uq_participants_event_id_id UNIQUE (event_id, id);
  END IF;
END$$;

ALTER TABLE votes DROP CONSTRAINT IF EXISTS fk_votes_participant;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_votes_event_participant'
  ) THEN
    ALTER TABLE votes
      ADD CONSTRAINT fk_votes_event_participant
      FOREIGN KEY (event_id, participant_id)
      REFERENCES participants (event_id, id) ON DELETE CASCADE;
  END IF;
END$$;
