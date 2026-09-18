-- 010 — Лидерборды (универсальные для любого типа мероприятия)
CREATE TABLE IF NOT EXISTS leaderboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0,
  rank INTEGER CHECK (rank IS NULL OR rank >= 1),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CONSTRAINT uq_leaderboards_event_participant UNIQUE (event_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_leaderboards_event_score ON leaderboards(event_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboards_event_rank ON leaderboards(event_id, rank);
