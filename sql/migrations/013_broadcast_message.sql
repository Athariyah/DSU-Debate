-- 013: текст для экрана трансляции (управляется из админки, показывается крупно по центру)
ALTER TABLE events ADD COLUMN broadcast_message TEXT;
