-- Флаг «скрыть от публики»: TRUE — дебат не показывается обычным пользователям
-- (публичные списки, активный дебат, страница по id и голосование),
-- администраторам остаётся видимым в панели управления.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS hidden_from_public BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN events.hidden_from_public IS
  'TRUE — дебат скрыт от обычных пользователей; виден только администраторам.';
