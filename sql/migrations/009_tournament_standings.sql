-- 009 — Турнирные таблицы (агрегаты по матчам)
CREATE TABLE IF NOT EXISTS tournament_standings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
  draws INTEGER NOT NULL DEFAULT 0 CHECK (draws >= 0),
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  position INTEGER CHECK (position IS NULL OR position >= 1),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CONSTRAINT uq_standings_event_participant UNIQUE (event_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_standings_event_id ON tournament_standings(event_id);
CREATE INDEX IF NOT EXISTS idx_standings_event_points ON tournament_standings(event_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_standings_position ON tournament_standings(event_id, position);
