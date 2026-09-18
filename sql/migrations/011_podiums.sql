-- 011 — Пьедестал почёта (топ-3)
CREATE TABLE IF NOT EXISTS podiums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  place INTEGER NOT NULL CHECK (place IN (1,2,3)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CONSTRAINT uq_podiums_event_place UNIQUE (event_id, place),
  CONSTRAINT uq_podiums_event_participant UNIQUE (event_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_podiums_event_id ON podiums(event_id);
