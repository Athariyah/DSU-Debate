#!/usr/bin/env bash
# pg_dump → SQLite conversion pipeline
# Usage: ./tools/pg-dump-to-sqlite.sh [pg_url] [sqlite_path]
# Example: ./tools/pg-dump-to-sqlite.sh "postgres://postgres:postgres@127.0.0.1:55432/dsu_debate" "./backend/.localdb/database.sqlite"
set -euo pipefail

PG_URL="${1:-${DATABASE_URL:-postgres://postgres:postgres@127.0.0.1:55432/dsu_debate}}"
SQLITE_PATH="${2:-./backend/.localdb/database.sqlite}"
DUMP_TMP="$(mktemp /tmp/dsu_pg_dump_XXXXXX.sql)"

echo "[pg→sqlite] pg_dump from $PG_URL"
echo "[pg→sqlite] tmp dump: $DUMP_TMP"
echo "[pg→sqlite] target sqlite: $SQLITE_PATH"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --data-only --inserts --column-inserts --no-owner --no-privileges "$PG_URL" -f "$DUMP_TMP" || {
    echo "[pg→sqlite] pg_dump failed, is PostgreSQL running and PG_URL correct?"
    exit 1
  }
  echo "[pg→sqlite] pg_dump done: $(wc -l < "$DUMP_TMP") lines"
else
  echo "[pg→sqlite] pg_dump not found, trying direct copy via node"
  PG_DUMP_URL="$PG_URL" node tools/migrate-pg-to-sqlite.mjs --from-pg --sqlite="$SQLITE_PATH"
  exit 0
fi

echo "[pg→sqlite] converting and importing via node…"
node tools/migrate-pg-to-sqlite.mjs --dump="$DUMP_TMP" --sqlite="$SQLITE_PATH"
echo "[pg→sqlite] verifying…"
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$SQLITE_PATH" "SELECT 'events', COUNT(*) FROM events UNION ALL SELECT 'participants', COUNT(*) FROM participants UNION ALL SELECT 'votes', COUNT(*) FROM votes;"
else
  echo "[pg→sqlite] sqlite3 not installed, skipping count verify"
fi
rm -f "$DUMP_TMP"
echo "[pg→sqlite] done"
