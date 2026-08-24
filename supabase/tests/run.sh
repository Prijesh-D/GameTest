#!/usr/bin/env bash
# Runs the schema against a throwaway local Postgres and checks the derived
# stats and RLS policies. Nothing here touches your Supabase project.
#
#   ./supabase/tests/run.sh
#
# Requires a local Postgres 16 (server binaries, not just psql). Postgres
# refuses to run as root, so if you are root this expects an unprivileged user
# to run the cluster as — set PGTEST_USER.
set -euo pipefail

PGTEST_USER="${PGTEST_USER:-$(id -un)}"
PGTEST_HOME="${PGTEST_HOME:-/tmp/gymgroup-pgtest}"
PGPORT="${PGPORT:-55432}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

as_pg() {
  if [ "$(id -un)" = "$PGTEST_USER" ]; then bash -c "$1"; else su "$PGTEST_USER" -c "$1"; fi
}

if [ ! -d "$PGTEST_HOME/pgdata" ]; then
  echo "==> initdb"
  mkdir -p "$PGTEST_HOME"
  chown -R "$PGTEST_USER" "$PGTEST_HOME"
  as_pg "$PGBIN/initdb -D $PGTEST_HOME/pgdata -U postgres --auth=trust" >/dev/null
fi

if ! "$PGBIN/pg_isready" -h "$PGTEST_HOME" -p "$PGPORT" >/dev/null 2>&1; then
  echo "==> starting postgres on port $PGPORT"
  as_pg "$PGBIN/pg_ctl -D $PGTEST_HOME/pgdata -o '-p $PGPORT -k $PGTEST_HOME' -l $PGTEST_HOME/pgdata/log start" >/dev/null
  sleep 2
fi

export PGHOST="$PGTEST_HOME" PGPORT PGUSER=postgres

echo "==> rebuilding gymtest database"
psql -q -c "drop database if exists gymtest;" -c "create database gymtest;" >/dev/null

echo "==> applying stub + migrations"
psql -q -d gymtest -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/00_local_stub.sql" >/dev/null
for m in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$m")"
  psql -q -d gymtest -v ON_ERROR_STOP=1 -f "$m" >/dev/null
done

echo
echo "==> stats"
psql -q -d gymtest -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/01_stats.sql"

echo
echo "==> rls"
psql -q -d gymtest -f "$ROOT/supabase/tests/02_rls.sql"

echo
echo "All checks ran. Compare the numbers against the expectations in each file."
