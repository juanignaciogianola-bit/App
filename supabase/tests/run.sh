#!/usr/bin/env bash
# Runs supabase/tests/*_test.sql (each wraps itself in begin/rollback).
#   SUPABASE_DB_URL=postgresql://... npm run test:db   -> against a real (local) Supabase,
#                                                        e.g. after `supabase db reset`
#   npm run test:db                                    -> throwaway Postgres + Supabase stub
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
T="$ROOT/supabase/tests"
run_tests() { # $@ = psql command
  "$@" -c "set client_min_messages = warning" -f "$T/helpers.sql"
  for t in "$T"/*_test.sql; do
    echo "test $(basename "$t")"
    "$@" -f "$t" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
  done
  echo "all database tests passed"
}

if [ -n "${SUPABASE_DB_URL:-}" ]; then
  run_tests psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -tA -o /dev/null
  exit 0
fi

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)"; PORT="${PGPORT_TEST:-54329}"
RUN=(); [ "$(id -u)" = 0 ] && RUN=(runuser -u postgres --) && chown postgres "$DATA"
cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
"${RUN[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=''" -w start >/dev/null
PSQL=("${RUN[@]}" "$PGBIN/psql" -h "$DATA" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -tA -o /dev/null)
"${PSQL[@]}" -f "$T/stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "migrate $(basename "$f")"; "${PSQL[@]}" -f "$f"; done
run_tests "${PSQL[@]}"
