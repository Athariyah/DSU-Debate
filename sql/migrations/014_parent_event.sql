-- 014: multiple votings per event — child events via parent_event_id
ALTER TABLE events ADD COLUMN parent_event_id INTEGER REFERENCES events(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_events_parent_id ON events(parent_event_id);
-- allow multiple active votings (child events) while keeping single active top-level event
DROP INDEX IF EXISTS uq_events_single_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_single_active_top ON events(status) WHERE status = 'active' AND parent_event_id IS NULL;
