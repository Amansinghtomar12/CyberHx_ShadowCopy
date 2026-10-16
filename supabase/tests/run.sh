#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
#  Apply every migration to a throwaway database and run the SQL tests.
#
#  The migrations are written for Supabase, so a bare Postgres is missing
#  the handful of things Supabase provides: the auth schema and auth.uid(),
#  the three roles, and the storage schema. bootstrap.sql stands those up —
#  as stubs, with auth.uid() reading a session setting so a test can say
#  who it is. Nothing in bootstrap.sql is ever applied to a real database.
#
#    supabase/tests/run.sh                 # start a cluster, test, stop
#    PGPORT=54399 supabase/tests/run.sh    # pick the port
#
#  Exit status is 0 only when no check printed MISMATCH and no statement
#  raised. The output is the test's own expected/actual lines.
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT="${PGPORT:-54399}"
PGDATA="${PGDATA:-/tmp/pgt/data}"
DB="pinaka_test_$$"

export PATH="$PGBIN:$PATH"
psql_() { psql -h 127.0.0.1 -p "$PGPORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }

if ! psql -h 127.0.0.1 -p "$PGPORT" -U postgres -c 'select 1' >/dev/null 2>&1; then
  echo "No cluster on port $PGPORT. Start one with:"
  echo "  $PGBIN/initdb -D $PGDATA -A trust -U postgres"
  echo "  $PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -c listen_addresses=127.0.0.1' -l /tmp/pgt/server.log start"
  exit 2
fi

trap 'psql -h 127.0.0.1 -p "$PGPORT" -U postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true' EXIT

psql_ -c "CREATE DATABASE $DB" >/dev/null
psql_ -d "$DB" -q -f "$HERE/bootstrap.sql"

for f in "$REPO"/supabase/migrations/*.sql; do
  if ! psql_ -d "$DB" -q -f "$f" > /tmp/mig.out 2>&1; then
    echo "FAILED: $(basename "$f")"; tail -20 /tmp/mig.out; exit 1
  fi
done
echo "applied $(ls "$REPO"/supabase/migrations/*.sql | wc -l) migrations"

psql_ -d "$DB" -q -f "$HERE/fixtures.sql"

status=0
for t in "$HERE"/*_test.sql; do
  echo
  echo "── $(basename "$t") ──────────────────────────────────────────"
  out="$(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d "$DB" -X -q -t -A -v ON_ERROR_STOP=1 -f "$t" 2>&1)" || status=1
  echo "$out"
  if grep -q MISMATCH <<<"$out"; then status=1; fi
done

echo
if [ "$status" -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "FAILURES ABOVE"; fi
exit "$status"
