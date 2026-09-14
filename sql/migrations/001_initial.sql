-- =========================================================================
-- DSU DEBATE — DDL СХЕМА БАЗЫ ДАННЫХ (PostgreSQL)
-- =========================================================================
-- Архитектура: 4 таблицы
--   admins        — администраторы платформы (полноценная авторизация)
--   events        — мероприятия (дебаты)
--   participants  — участники конкретного дебата
--   votes         — голоса зрителей с anti-fraud защитой (IP + fingerprint)
-- =========================================================================

-- -------------------------------------------------------------------------
-- Расширения
-- -------------------------------------------------------------------------
-- pgcrypto нужен для генерации UUID на стороне БД, если понадобится (gen_random_uuid()).
-- В управляемых БД (Amvera CNPG и аналоги) у прикладного пользователя обычно
-- нет прав суперпользователя, а расширение может быть недоступно — тогда
-- установку пропускаем с предупреждением: приложение использует UUID,
-- сгенерированные на стороне Node, и от pgcrypto не зависит.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE WARNING 'pgcrypto не установлено: у пользователя % нет прав суперпользователя. Расширение не требуется для работы приложения.', current_user;
    WHEN feature_not_supported THEN
      RAISE WARNING 'pgcrypto недоступно в этой БД — продолжаем без него (UUID генерируются на стороне приложения).';
  END;
END$$;

-- -------------------------------------------------------------------------
-- ENUM: статус мероприятия
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE event_status AS ENUM ('upcoming', 'active', 'completed');
  END IF;
END$$;

-- -------------------------------------------------------------------------
-- Универсальная функция для автообновления updated_at
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- 1. ADMINS — администраторы (Email + Password, JWT авторизация)
-- =========================================================================
CREATE TABLE IF NOT EXISTS admins (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT uq_admins_email UNIQUE (email),
  CONSTRAINT chk_admins_email_format
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Быстрый поиск при логине (UNIQUE уже создаёт индекс, дублируем явно для читаемости не нужно)
-- CREATE UNIQUE INDEX уже создан автоматически constraint'ом uq_admins_email

-- =========================================================================
-- 2. EVENTS — мероприятия (дебаты)
-- =========================================================================
CREATE TABLE IF NOT EXISTS events (
  id              SERIAL PRIMARY KEY,
  title           VARCHAR(500) NOT NULL,
  status          event_status NOT NULL DEFAULT 'upcoming',
  date_time       TIMESTAMPTZ  NOT NULL,
  created_by      INTEGER      NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT fk_events_created_by
    FOREIGN KEY (created_by) REFERENCES admins (id) ON DELETE RESTRICT,
  CONSTRAINT chk_events_title_not_empty CHECK (btrim(title) <> '')
);

-- Индекс по статусу — самый частый фильтр (например GET /api/events/active)
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);

-- Индекс по дате — для сортировки списка ближайших дебатов
CREATE INDEX IF NOT EXISTS idx_events_date_time ON events (date_time);

-- Бизнес-правило: одновременно может быть только ОДИН активный дебат.
-- Частичный уникальный индекс гарантирует это на уровне БД.
CREATE UNIQUE INDEX IF NOT EXISTS uq_events_single_active
  ON events (status)
  WHERE status = 'active';

DROP TRIGGER IF EXISTS set_updated_at_events ON events;
CREATE TRIGGER set_updated_at_events
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- =========================================================================
-- 3. PARTICIPANTS — участники дебата
-- =========================================================================
CREATE TABLE IF NOT EXISTS participants (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER      NOT NULL,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT fk_participants_event
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  CONSTRAINT chk_participants_name_not_empty CHECK (btrim(name) <> ''),
  CONSTRAINT uq_participants_event_id_id UNIQUE (event_id, id)
);

-- Индекс по event_id — выборка всех участников конкретного дебата (JOIN c votes)
CREATE INDEX IF NOT EXISTS idx_participants_event_id ON participants (event_id);

-- =========================================================================
-- 4. VOTES — голоса зрителей (anti-fraud: device_fingerprint + ip_address)
-- =========================================================================
CREATE TABLE IF NOT EXISTS votes (
  id                  BIGSERIAL PRIMARY KEY,
  event_id            INTEGER      NOT NULL,
  participant_id      INTEGER      NOT NULL,
  voter_name          VARCHAR(255),
  device_fingerprint  UUID         NOT NULL,
  ip_address          INET         NOT NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT fk_votes_event
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  CONSTRAINT fk_votes_event_participant
    FOREIGN KEY (event_id, participant_id)
    REFERENCES participants (event_id, id) ON DELETE CASCADE,

  -- ANTI-FRAUD: на уровне БД запрещаем повторный голос с того же fingerprint
  -- или с того же IP в рамках ОДНОГО мероприятия (второй уровень защиты,
  -- первый уровень — явная проверка в контроллере перед INSERT).
  CONSTRAINT uq_votes_event_fingerprint UNIQUE (event_id, device_fingerprint),
  CONSTRAINT uq_votes_event_ip UNIQUE (event_id, ip_address)
);

-- Индексы для быстрой агрегации голосов и подсчёта процентов в реальном времени
CREATE INDEX IF NOT EXISTS idx_votes_event_id ON votes (event_id);
CREATE INDEX IF NOT EXISTS idx_votes_participant_id ON votes (participant_id);
CREATE INDEX IF NOT EXISTS idx_votes_event_participant ON votes (event_id, participant_id);

-- Отдельные индексы под быстрый lookup дублей (constraint'ы уже создают unique-индексы,
-- но явное перечисление ниже — для документирования используемых путей поиска):
--   uq_votes_event_fingerprint -> ускоряет WHERE event_id = ? AND device_fingerprint = ?
--   uq_votes_event_ip          -> ускоряет WHERE event_id = ? AND ip_address = ?

-- =========================================================================
-- Пример проверочных запросов (не выполняются автоматически)
-- =========================================================================
-- Активный дебат с участниками:
--   SELECT e.*, p.* FROM events e
--   JOIN participants p ON p.event_id = e.id
--   WHERE e.status = 'active';
--
-- Подсчёт голосов и процентов по участникам дебата:
--   SELECT p.id, p.name, COUNT(v.id) AS votes_count,
--          ROUND(COUNT(v.id)::numeric * 100 / NULLIF(SUM(COUNT(v.id)) OVER (), 0), 1) AS percentage
--   FROM participants p
--   LEFT JOIN votes v ON v.participant_id = p.id
--   WHERE p.event_id = :eventId
--   GROUP BY p.id, p.name;
