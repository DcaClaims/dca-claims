#!/usr/bin/env bash
# Applies each migration in db/migrations once, in order, each in its own transaction.
# Usage: DATABASE_URL=postgresql://... bash scripts/migrate.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is not set}"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -t -A)
"${PSQL[@]}" -c "create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())" >/dev/null
for f in "$ROOT"/db/migrations/*.sql; do
  name=$(basename "$f")
  done_already=$("${PSQL[@]}" -c "select 1 from public.schema_migrations where name = '$name'")
  if [ "$done_already" = "1" ]; then echo "already applied  $name"; continue; fi
  echo "applying         $name"
  { echo "begin;"; cat "$f"; echo; echo "insert into public.schema_migrations (name) values ('$name') on conflict do nothing;"; echo "commit;"; } | "${PSQL[@]}" >/dev/null
done
echo "database is up to date"
