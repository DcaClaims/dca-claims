-- DCA Claims: core schema (Milestone 1)
-- Target: Postgres 15+ (Supabase). Row-level security policies are added in a later migration,
-- once logins exist; until then only the server (service role) touches these tables.

create extension if not exists pgcrypto;

-- ───────────────────────── People ─────────────────────────

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  full_name     text not null,
  role          text not null check (role in ('owner','caseworker','accounts','readonly')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table partners (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null unique,           -- used in the partner link
  contact_email         text,
  default_commission    numeric(5,4),                   -- e.g. 0.1000 = 10%; null until agreed
  airtable_record_id    text unique,
  created_at            timestamptz not null default now()
);

create table clients (
  id                  uuid primary key default gen_random_uuid(),
  full_name           text not null,
  language            text not null default 'en' check (language in ('en','he','fr')),
  phone               text,
  airtable_record_id  text unique,
  created_at          timestamptz not null default now()
);

-- A client can write from several addresses; each one is a matching signal.
create table client_emails (
  client_id   uuid not null references clients(id) on delete cascade,
  email       text not null,
  primary key (client_id, email)
);
create index client_emails_email on client_emails (lower(email));

-- ───────────────────────── Bookings and flights ─────────────────────────

create table bookings (
  id                     uuid primary key default gen_random_uuid(),
  pnr                    text,                          -- booking reference; not unique across airlines
  single_reservation     boolean,                       -- null = not established
  booked_via             text,                          -- airline direct, travel agent, OTA…
  partner_id             uuid references partners(id),
  created_at             timestamptz not null default now()
);
create index bookings_pnr on bookings (upper(pnr));

create table passengers (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  client_id    uuid references clients(id),             -- the person DCA deals with (may differ from passenger)
  full_name    text not null,
  is_infant    boolean not null default false,
  created_at   timestamptz not null default now()
);

create table sectors (
  id                   uuid primary key default gen_random_uuid(),
  booking_id           uuid not null references bookings(id) on delete cascade,
  seq                  int not null,                    -- order within the journey
  direction            text not null default 'outbound' check (direction in ('outbound','return')),
  flight_no            text not null,
  operating_carrier    text,                            -- IATA code
  marketing_carrier    text,
  dep_iata             char(3) not null,
  arr_iata             char(3) not null,
  sched_dep            timestamptz,
  sched_arr            timestamptz,
  actual_arr           timestamptz,
  actual_arr_source    text,                            -- where the actual time came from
  unique (booking_id, direction, seq)
);

create table disruptions (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null references bookings(id) on delete cascade,
  sector_id           uuid references sectors(id),     -- the flight that caused it
  kind                text not null check (kind in ('cancellation','delay','denied_boarding','missed_connection','downgrade','baggage')),
  notice_days         int,                              -- cancellation notice, if known
  reroute_dep         timestamptz,                      -- offered/used rerouting, if any
  reroute_arr         timestamptz,
  final_arrival       timestamptz,                      -- actual arrival at final destination
  final_arrival_source text,
  reason_given        text,                             -- what the airline said
  created_at          timestamptz not null default now()
);

-- ───────────────────────── Claims ─────────────────────────

create table claims (
  id                      uuid primary key default gen_random_uuid(),
  ref                     int generated always as identity (start with 1000) unique, -- DCA claim number
  legacy_ref              text unique,                  -- e.g. Airtable "161"
  booking_id              uuid not null references bookings(id),
  airline                 text not null,                -- IATA code of the carrier claimed against
  airline_case_ref        text,                         -- the airline's own reference
  authority_case_ref      text,                         -- ADR/authority reference
  regime_pursued          text check (regime_pursued in ('EU261','UK261','ASL','MONTREAL')),
  status                  text not null default 'new',
  owner_user_id           uuid references users(id),
  next_action             text,
  next_action_due         date,
  version                 int not null default 1,       -- bumped on every material change; approvals pin it
  managed_in_new_system   boolean not null default false, -- live-trial ownership switch
  airtable_record_id      text unique,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index claims_airline_case_ref on claims (upper(airline_case_ref));
create index claims_authority_case_ref on claims (upper(authority_case_ref));

create table claim_passengers (
  claim_id      uuid not null references claims(id) on delete cascade,
  passenger_id  uuid not null references passengers(id),
  primary key (claim_id, passenger_id)
);

-- Deadlines never disappear on a status change; they are closed explicitly.
create table deadlines (
  id          uuid primary key default gen_random_uuid(),
  claim_id    uuid not null references claims(id) on delete cascade,
  kind        text not null check (kind in ('airline_followup','adr','limitation','client_chase','other')),
  due_date    date not null,
  basis       text not null,                            -- how the date was worked out
  closed_at   timestamptz,
  closed_by   uuid references users(id)
);
create index deadlines_open on deadlines (due_date) where closed_at is null;

-- ───────────────────────── Rules and assessments ─────────────────────────

create table rule_sets (
  id            uuid primary key default gen_random_uuid(),
  regime        text not null,
  version       int not null,
  status        text not null default 'draft' check (status in ('draft','approved','retired')),
  body          jsonb not null,
  sources       jsonb not null default '[]',
  approved_by   uuid references users(id),
  approved_at   timestamptz,
  unique (regime, version),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);

create table assessments (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references claims(id) on delete cascade,
  passenger_id  uuid references passengers(id),
  regime        text not null,
  rule_set_id   uuid not null references rule_sets(id),
  outcome       text not null check (outcome in ('potentially_covered','not_covered','insufficient_information')),
  amount        numeric(10,2),
  currency      char(3),
  needs_review  boolean not null default false,
  working       jsonb not null,                         -- facts, sources, steps, flags
  created_at    timestamptz not null default now()
);

-- ───────────────────────── Money terms ─────────────────────────

create table fee_agreements (
  claim_id            uuid primary key references claims(id) on delete cascade,
  tnc_version         text not null,
  fee_rate            numeric(5,4) not null,            -- 0.2500
  applies_to          text[] not null,                  -- compensation, expenses, refunds, interest, costs
  vat_rate            numeric(5,4),                     -- null = not established
  partner_id          uuid references partners(id),
  partner_commission  numeric(5,4),
  exceptions          text,
  signed_at           timestamptz
);

-- ───────────────────────── Messages and documents ─────────────────────────

create table messages (
  id                   uuid primary key default gen_random_uuid(),
  mailbox              text not null,                   -- info@, office@ …
  direction            text not null check (direction in ('in','out')),
  rfc_message_id       text unique,                     -- Message-ID header
  in_reply_to          text,
  references_ids       text[] not null default '{}',
  from_address         text not null,
  from_name            text,
  to_addresses         text[] not null default '{}',
  cc_addresses         text[] not null default '{}',
  subject              text,
  body_text            text,
  received_at          timestamptz not null,
  classification       text check (classification in ('case','new_enquiry','spam','unrelated','uncertain')),
  classification_basis jsonb,                           -- why
  suspicious           boolean not null default false,
  suspicious_reasons   jsonb not null default '[]',
  reviewed_by          uuid references users(id),
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now()
);
create index messages_unreviewed on messages (received_at) where reviewed_at is null;

-- One message can concern several claims; one claim has many messages.
create table message_claims (
  message_id   uuid not null references messages(id) on delete cascade,
  claim_id     uuid not null references claims(id) on delete cascade,
  matched_by   text not null check (matched_by in ('auto','manual')),
  score        int,
  reasons      jsonb not null default '[]',
  created_by   uuid references users(id),
  created_at   timestamptz not null default now(),
  primary key (message_id, claim_id)
);

create table documents (
  id                  uuid primary key default gen_random_uuid(),
  claim_id            uuid references claims(id) on delete cascade,
  kind                text not null default 'other',   -- booking, id, receipt, airline_letter, deadlock, signed_form…
  original_filename   text not null,
  storage_path        text not null unique,             -- originals are never overwritten
  sha256              char(64) not null,
  bytes               bigint not null,
  source_message_id   uuid references messages(id),
  uploaded_by         uuid references users(id),
  created_at          timestamptz not null default now()
);
create index documents_sha on documents (sha256);

-- ───────────────────────── Drafts, approvals, sending ─────────────────────────

create table drafts (
  id                      uuid primary key default gen_random_uuid(),
  claim_id                uuid not null references claims(id) on delete cascade,
  in_reply_to_message_id  uuid references messages(id),
  to_addresses            text[] not null,
  cc_addresses            text[] not null default '{}',
  subject                 text not null,
  body                    text not null,
  attachments             jsonb not null default '[]',  -- document ids
  grounding               jsonb not null default '[]',  -- statement → source
  flags                   jsonb not null default '[]',  -- unsupported statements, suspicious input…
  based_on_claim_version  int not null,
  status                  text not null default 'draft' check (status in ('draft','approved','stale','sent','discarded')),
  created_by              text not null,                -- 'ai' or a user id
  created_at              timestamptz not null default now()
);

-- Every human edit is kept beside the original, labelled.
create table draft_corrections (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid not null references drafts(id) on delete cascade,
  before_body   text not null,
  after_body    text not null,
  kind          text not null check (kind in ('substantive','stylistic')),
  note          text,
  user_id       uuid not null references users(id),
  created_at    timestamptz not null default now()
);

create table approvals (
  id             uuid primary key default gen_random_uuid(),
  draft_id       uuid not null references drafts(id) on delete cascade,
  payload_hash   char(64) not null,                     -- exact recipients, text, attachments, follow-up
  claim_version  int not null,                          -- the case as it stood when approved
  approved_by    uuid not null references users(id),
  approved_at    timestamptz not null default now(),
  revoked_at     timestamptz
);

-- The send log. One row per intended action; the unique key is the duplicate control.
create table outbound_actions (
  id                 uuid primary key default gen_random_uuid(),
  idempotency_key    char(64) not null unique,
  claim_id           uuid references claims(id),
  action_type        text not null,                     -- reply, reminder_7d, status_email, filing…
  approval_id        uuid references approvals(id),
  payload_hash       char(64) not null,
  state              text not null check (state in ('pending','sending','sent','uncertain','failed','cancelled')),
  rfc_message_id     text unique,                       -- generated before sending, used to find it in Sent
  provider_ref       text,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index outbound_actions_claim on outbound_actions (claim_id, action_type, state);

-- One sender per case.
create table case_locks (
  claim_id     uuid primary key references claims(id) on delete cascade,
  held_by      text not null,                           -- user id or automation name
  purpose      text not null,
  acquired_at  timestamptz not null default now(),
  expires_at   timestamptz not null
);

-- ───────────────────────── Running it ─────────────────────────

create table settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now()
);
insert into settings (key, value) values
  ('sending_stage', '"A"'),          -- A draft only, B test addresses, C live trial
  ('global_pause', 'false'),
  ('test_allow_list', '[]');

create table automation_runs (
  id           uuid primary key default gen_random_uuid(),
  automation   text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running','ok','failed')),
  error        text
);

create table audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      text not null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb not null default '{}'
);

-- Audit rows are append-only.
create function audit_log_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_log is append-only'; end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- Any change to a claim bumps its version, so approvals pinned to the old version go stale.
create function claims_bump_version() returns trigger language plpgsql as $$
begin
  if row(new.*) is distinct from row(old.*) and new.version = old.version then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger claims_version before update on claims
  for each row execute function claims_bump_version();

-- A new message linked to a claim, or a new deadline, changes the case: bump the version.
create function bump_claim_version_from_child() returns trigger language plpgsql as $$
begin
  update claims set version = version + 1 where id = new.claim_id;
  return new;
end $$;
create trigger message_claims_bump after insert on message_claims
  for each row execute function bump_claim_version_from_child();
create trigger deadlines_bump after insert or update on deadlines
  for each row execute function bump_claim_version_from_child();
