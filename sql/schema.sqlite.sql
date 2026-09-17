-- =========================================================================
-- DSU DEBATE — SQLITE СХЕМА (WAL, оптимизирована для голосования)
-- Архитектура: расширенный домен — events.type + matches + standings + leaderboards + podiums
-- =========================================================================
PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------------------
-- 0. Служебная таблица миграций
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- =========================================================================
-- 1. ADMINS
-- =========================================================================
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CONSTRAINT uq_admins_email UNIQUE (email),
  CONSTRAINT chk_admins_email_format CHECK (email LIKE '%@%.%')
);

-- =========================================================================
-- 2. EVENTS — расширенный домен
-- -------------------------------------------------------------------------
-- event_type: debate (классические дебаты), tournament (турнир), poll (опрос),
--             competition (соревнование), quiz, other
-- =========================================================================
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','active','completed')),
  event_type TEXT NOT NULL DEFAULT 'debate' CHECK (event_type IN ('debate','tournament','poll','competition','quiz','other')),
  date_time TEXT NOT NULL,
  voting_duration_minutes INTEGER CHECK (voting_duration_minutes IS NULL OR voting_duration_minutes >= 1),
  voting_started_at TEXT,
  votes_hidden INTEGER NOT NULL DEFAULT 0,
  hidden_from_public INTEGER NOT NULL DEFAULT 0,
  custom_type_label TEXT,
  show_leaderboard INTEGER NOT NULL DEFAULT 1 CHECK (show_leaderboard IN (0,1)),
  show_standings INTEGER NOT NULL DEFAULT 1 CHECK (show_standings IN (0,1)),
  show_podium INTEGER NOT NULL DEFAULT 1 CHECK (show_podium IN (0,1)),
  broadcast_message TEXT,
  created_by INTEGER NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CONSTRAINT chk_events_title_not_empty CHECK (trim(title) <> '')
);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date_time ON events(date_time);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_custom_label ON events(custom_type_label);
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_single_active ON events(status) WHERE status = 'active';

DROP TRIGGER IF EXISTS set_updated_at_events;
CREATE TRIGGER set_updated_at_events BEFORE UPDATE ON events FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE events SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id;
END;

-- =========================================================================
-- 3. PARTICIPANTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CONSTRAINT uq_participants_event_id_id UNIQUE (event_id, id)
);
CREATE INDEX IF NOT EXISTS idx_participants_event_id ON participants(event_id);

-- =========================================================================
-- 4. VOTES — anti-fraud: device_fingerprint + ip_address
-- =========================================================================
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participant_id INTEGER NOT NULL,
  voter_name TEXT,
  device_fingerprint TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (event_id, participant_id) REFERENCES participants(event_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_votes_event_fingerprint UNIQUE (event_id, device_fingerprint),
  CONSTRAINT uq_votes_event_ip UNIQUE (event_id, ip_address)
);
CREATE INDEX IF NOT EXISTS idx_votes_event_id ON votes(event_id);
CREATE INDEX IF NOT EXISTS idx_votes_participant_id ON votes(participant_id);
CREATE INDEX IF NOT EXISTS idx_votes_event_participant ON votes(event_id, participant_id);

-- =========================================================================
-- 5. MATCHES — пары участников для турниров
-- =========================================================================
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

-- =========================================================================
-- 6. TOURNAMENT_STANDINGS — агрегированная таблица турнира
-- =========================================================================
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

-- =========================================================================
-- 7. LEADERBOARDS — универсальный лидерборд для любого типа мероприятия
--    Дебаты: score = votes; Турнир: score = points; Опрос: score = votes и т.д.
--    Обновляется триггером / приложением при голосовании или завершении матчей.
-- =========================================================================
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

-- =========================================================================
-- 8. PODIUMS — пьедестал почёта (топ-3) для каждого мероприятия
-- =========================================================================
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

-- =========================================================================
-- Индексы для ускорения агрегатов и анти-fraud
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_votes_fingerprint ON votes(event_id, device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_votes_ip ON votes(event_id, ip_address);
