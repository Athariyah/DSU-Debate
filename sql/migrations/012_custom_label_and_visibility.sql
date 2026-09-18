-- 012: кастомное название типа "другое" + гибкие вкладки мероприятия
ALTER TABLE events ADD COLUMN custom_type_label TEXT;
ALTER TABLE events ADD COLUMN show_leaderboard INTEGER NOT NULL DEFAULT 1 CHECK (show_leaderboard IN (0,1));
ALTER TABLE events ADD COLUMN show_standings INTEGER NOT NULL DEFAULT 1 CHECK (show_standings IN (0,1));
ALTER TABLE events ADD COLUMN show_podium INTEGER NOT NULL DEFAULT 1 CHECK (show_podium IN (0,1));
CREATE INDEX IF NOT EXISTS idx_events_custom_label ON events(custom_type_label);
