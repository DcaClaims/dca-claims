-- Row-level security on every table. With no policies, nothing is readable or writable through the public API
-- (anon or logged-in browser keys). Only the server, using the secret key after checking the login and two-step
-- verification, can read or write. Policies for direct browser access can be added table by table later.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Link app users to their login (Supabase Auth user id).
alter table users add column auth_user_id uuid unique;

-- Migrations applied (written by the migration runner).
create table if not exists schema_migrations (
  name        text primary key,
  applied_at  timestamptz not null default now()
);
alter table schema_migrations enable row level security;
