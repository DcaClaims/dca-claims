-- Fields used by the screens and the Stage A workflow (accept/decline, manual matching, approvals, edits).

alter table claims
  add column client_id uuid references clients(id),
  add column title text,                         -- e.g. "Adler v Lufthansa"
  add column upload_token text unique,           -- personal upload link
  add column lead_flags jsonb not null default '{}', -- war-related, airline cites weather, baggage only, not our line
  add column waiting_on_us_since date,
  add column notes text,
  add column decided_at timestamptz,             -- accept / decline decision on a new lead
  add column decided_by uuid references users(id),
  add column decision text check (decision in ('accepted', 'declined', 'asked_for_details'));

alter table disruptions
  add column extraordinary text check (extraordinary in ('none_known', 'claimed_by_airline', 'established'));

alter table messages
  add column attachments jsonb not null default '[]', -- [{filename, text}] text extracted for matching and checks
  add column headers jsonb not null default '{}',      -- the few headers sorting needs (List-Unsubscribe, Auto-Submitted, Precedence)
  add column override text check (override in ('spam', 'lead', 'unrelated'));

alter table drafts
  add column kind text not null default 'client',
  add column language text not null default 'en';

-- Facts a draft may state: amounts and dates on record for the case (offers, payments, key dates).
create table case_facts (
  id         uuid primary key default gen_random_uuid(),
  claim_id   uuid not null references claims(id) on delete cascade,
  kind       text not null check (kind in ('amount', 'date')),
  amount     numeric(12,2),
  currency   char(3),
  on_date    date,
  what       text not null,
  created_at timestamptz not null default now(),
  check ((kind = 'amount' and amount is not null and currency is not null) or (kind = 'date' and on_date is not null))
);
alter table case_facts enable row level security;
create trigger case_facts_bump after insert or update on case_facts
  for each row execute function bump_claim_version_from_child();
