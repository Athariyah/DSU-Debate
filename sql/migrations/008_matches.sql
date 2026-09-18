-- 008 — Таблица матчей для турниров
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round INTEGER NOT NULL DEFAULT 1 CHECK (round >= 1),
  participant1_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  participant2_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  winner_id INTEGER REFERENCES participants(id) ON DELETE SET NULL,
  score1 INTEGER NOT NULL DEFAULT 0,
  score2 INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','active','completed','draw')),
  scheduled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CONSTRAINT chk_matches_different_participants CHECK (participant1_id <> participant2_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_event_id ON matches(event_id);
CREATE INDEX IF NOT EXISTS idx_matches_event_round ON matches(event_id, round);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
DROP TRIGGER IF EXISTS set_updated_at_matches;
CREATE TRIGGER set_updated_at_matches BEFORE UPDATE ON matches FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE matches SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id;
END;
