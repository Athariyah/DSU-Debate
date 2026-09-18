-- 007 — Расширение домена: тип мероприятия (debate -> любые мероприятия)
-- Добавляет колонку event_type для поддержки турниров, опросов и др.
-- Для SQLite: IF NOT EXISTS не поддерживается в старых версиях, поэтому проверяем через pragma.

-- Попытка добавить колонку, если её нет (SQLite >= 3.20 поддерживает ADD COLUMN)
-- Миграция идемпотентна: повторный запуск не сломает БД (ошибка будет проигнорирована приложением).
ALTER TABLE events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'debate' CHECK (event_type IN ('debate','tournament','poll','competition','quiz','other'));
-- Индекс по типу для фильтрации в списках
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
