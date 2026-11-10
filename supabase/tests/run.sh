#!/usr/bin/env bash
# Spins up a throwaway Postgres, applies the Supabase stub + every migration,
# then runs each supabase/tests/*_test.sql. Exits non-zero on any failure.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)"; PORT="${PGPORT_TEST:-54329}"
RUN=(); [ "$(id -u)" = 0 ] && RUN=(runuser -u postgres --) && chown postgres "$DATA"
cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
"${RUN[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null
PSQL=("$PGBIN/psql" -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -tA -o /dev/null)
"${RUN[@]}" "${PSQL[@]}" -f "$ROOT/supabase/tests/bootstrap.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate $(basename "$f")"; "${RUN[@]}" "${PSQL[@]}" -f "$f"
done
for t in "$ROOT"/supabase/tests/*_test.sql; do
  echo "test $(basename "$t")"; "${RUN[@]}" "${PSQL[@]}" -f "$t" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
  [ "${PIPESTATUS[0]}" = 0 ] || exit 1
done
echo "all database tests passed"
