#!/usr/bin/env bash
# Applies every migration to a throwaway local Postgres and runs db/tests/*.sql.
set -euo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
PORT=${PORT:-54329}
cleanup() { "$PGBIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$TMP" 2>/dev/null || true
  RUN="runuser -u postgres --"
else
  RUN=""
fi
$RUN "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null

PSQL="psql -X -q -v ON_ERROR_STOP=1 -h $TMP -p $PORT -U postgres -d postgres"
for f in "$ROOT"/db/migrations/*.sql; do echo "migrate  $(basename "$f")"; $PSQL -f "$f"; done
for f in "$ROOT"/db/tests/*.sql; do echo "test     $(basename "$f")"; $PSQL -f "$f"; done
echo "schema OK"
