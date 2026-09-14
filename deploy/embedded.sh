#!/bin/sh
# Boots the built-in stack (PostgreSQL + Node backend) when this image runs
# as a single all-in-one container (Kubernetes / one-container platforms).
#
# When RUN_MODE != "embedded" the script exits immediately: the container
# then only runs nginx and proxies /api + /socket.io to $BACKEND_HOST
# (multi-service docker-compose style deployment).
#
# Managed/external database (Amvera CNPG and similar):
#   set DATABASE_URL (or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD) to the
#   external database and EMBEDDED_POSTGRES=false — then the built-in
#   PostgreSQL is NOT started (saves memory) and the backend connects to the
#   managed cluster. EMBEDDED_POSTGRES defaults to true, i.e. the previous
#   behaviour (built-in PostgreSQL always started).
set -e

if [ "${RUN_MODE:-embedded}" != "embedded" ]; then
  echo "[embedded] RUN_MODE is not 'embedded' — built-in PostgreSQL/backend skipped (proxy mode)" >&2
  exit 0
fi

PGDATA=/var/lib/postgresql/data
PG_USER=postgres
DB_USER=dsu
DB_PASS=dsu
DB_NAME=dsu_debate

# Prints the database host the backend will use — never the password.
print_db_target() {
  if [ -n "${DB_HOST:-}" ]; then
    echo "${DB_HOST}"
    return
  fi
  if [ -n "${DATABASE_URL:-}" ]; then
    host_part="${DATABASE_URL#*://}"
    host_part="${host_part##*@}"
    echo "${host_part%%[:/?]*}"
    return
  fi
  echo "127.0.0.1 (built-in)"
}

# Should the built-in PostgreSQL be started? Anything false-ish disables it.
embedded_postgres_enabled() {
  case "${EMBEDDED_POSTGRES:-true}" in
    false | False | FALSE | 0 | no | No | NO | off | Off | OFF) return 1 ;;
    *) return 0 ;;
  esac
}

# Runs the Node backend under a respawn loop (migrations + admin seed run at
# start; see src/server.ts).
run_backend() {
  trap 'exit 0' TERM INT
  echo "[embedded] starting backend on port ${PORT:-4000} (database: $(print_db_target))" >&2
  while :; do
    if node /app/dist/server.js; then
      code=0
    else
      code=$?
    fi
    echo "[embedded] backend exited with code $code, restarting in 2s" >&2
    sleep 2
  done
}

echo "[embedded] starting built-in stack: postgres + node backend" >&2

# Strong ephemeral JWT secret by default; a stable one (sessions survive
# restarts) can be supplied via the JWT_SECRET environment variable.
if [ -z "${JWT_SECRET:-}" ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  export JWT_SECRET
  echo "[embedded] generated an ephemeral JWT_SECRET (set JWT_SECRET to keep sessions across restarts)" >&2
fi

if ! embedded_postgres_enabled; then
  echo "[embedded] EMBEDDED_POSTGRES is disabled — skipping built-in PostgreSQL, using external database: $(print_db_target)" >&2
  run_backend
fi

# PostgreSQL tooling location can vary between distro package versions.
PSQL_BIN=$(command -v psql) || {
  echo "[embedded] ERROR: psql not found — PostgreSQL package missing from the image" >&2
  exit 1
}
PG_BINDIR=$(dirname "$PSQL_BIN")

# --- PostgreSQL: initialize the cluster on first run -----------------------
mkdir -p "$PGDATA" /var/run/postgresql

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  chown -R "$PG_USER":"$PG_USER" /var/lib/postgresql
  echo "[embedded] initializing PostgreSQL cluster in $PGDATA" >&2
  su -s /bin/sh "$PG_USER" -c "$PG_BINDIR/initdb -D $PGDATA --auth-local=trust --auth-host=trust --encoding=UTF8"
fi
chown "$PG_USER":"$PG_USER" /var/run/postgresql 2>/dev/null || true

# --- PostgreSQL: run under a respawn loop ----------------------------------
# If a previous instance is still running (e.g. supervisord restarted this
# script), reuse it instead of starting a second server.
PG_LOOP_PID=""
if su -s /bin/sh "$PG_USER" -c "$PG_BINDIR/pg_isready -h 127.0.0.1 -p 5432 -q" 2>/dev/null; then
  echo "[embedded] PostgreSQL already running — reusing existing instance" >&2
else
  (
    while :; do
      if su -s /bin/sh "$PG_USER" -c "$PG_BINDIR/postgres -D $PGDATA -c listen_addresses=127.0.0.1"; then
        code=0
      else
        code=$?
      fi
      echo "[embedded] postgres exited with code $code, restarting in 2s" >&2
      sleep 2
    done
  ) &
  PG_LOOP_PID=$!

  # Wait for the database to accept connections (max ~120s).
  i=0
  until su -s /bin/sh "$PG_USER" -c "$PG_BINDIR/pg_isready -h 127.0.0.1 -p 5432 -q"; do
    i=$((i + 1))
    if [ "$i" -ge 240 ]; then
      echo "[embedded] PostgreSQL did not become ready in 120s" >&2
      exit 1
    fi
    sleep 0.5
  done
fi

# --- Role (idempotent) -------------------------------------------------------
ROLE_SQL=/tmp/ensure-role.sql
cat > "$ROLE_SQL" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
  END IF;
END
\$\$;
SQL
chmod 644 "$ROLE_SQL"
su -s /bin/sh "$PG_USER" -c "$PG_BINDIR/psql -h 127.0.0.1 -p 5432 -v ON_ERROR_STOP=1 -f $ROLE_SQL" || \
  echo "[embedded] WARNING: could not ensure role $DB_USER — continuing" >&2
rm -f "$ROLE_SQL"
echo "[embedded] role $DB_USER ensured" >&2

# --- Database (idempotent, not fatal if something is off) --------------------
db_count=$(su -s /bin/sh "$PG_USER" -c "$PG_BINDIR/psql -h 127.0.0.1 -p 5432 -tAc \"SELECT 1 FROM pg_database WHERE datname='$DB_NAME'\"" || true)
if [ "$db_count" != "1" ]; then
  if su -s /bin/sh "$PG_USER" -c "$PG_BINDIR/createdb -h 127.0.0.1 -p 5432 -O $DB_USER $DB_NAME"; then
    echo "[embedded] created database $DB_NAME" >&2
  else
    echo "[embedded] createdb failed (database may already exist) — continuing" >&2
  fi
fi

# --- Backend: run under a respawn loop --------------------------------------
trap 'if [ -n "${PG_LOOP_PID:-}" ]; then kill "$PG_LOOP_PID" 2>/dev/null; fi; exit 0' TERM INT
run_backend
