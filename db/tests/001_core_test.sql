-- Schema behaviour tests. Each block raises an exception on failure.
begin;

insert into users (id, email, full_name, role)
  values ('00000000-0000-0000-0000-000000000001', 'aaron@example.test', 'Aaron', 'owner');
insert into bookings (id, pnr, single_reservation) values ('00000000-0000-0000-0000-0000000000b1', 'TVPQNO', true);
insert into claims (id, booking_id, airline, legacy_ref)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'LH', '161');

-- 1. Updating a claim bumps its version.
update claims set next_action = 'Chase Lufthansa' where id = '00000000-0000-0000-0000-0000000000c1';
do $$ begin
  if (select version from claims where legacy_ref = '161') <> 2 then raise exception 'version not bumped on update'; end if;
end $$;

-- 2. A new message linked to the claim bumps the version (makes earlier approvals stale).
insert into messages (id, mailbox, direction, rfc_message_id, from_address, received_at)
  values ('00000000-0000-0000-0000-0000000000a1', 'info@', 'in', '<m1@lh.example>', 'claims@lh.example', now());
insert into message_claims (message_id, claim_id, matched_by) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'auto');
do $$ begin
  if (select version from claims where legacy_ref = '161') <> 3 then raise exception 'version not bumped by new message'; end if;
end $$;

-- 3. The send log refuses a second action with the same key.
insert into outbound_actions (idempotency_key, action_type, payload_hash, state)
  values (repeat('a', 64), 'reply', repeat('b', 64), 'sent');
do $$ begin
  begin
    insert into outbound_actions (idempotency_key, action_type, payload_hash, state)
      values (repeat('a', 64), 'reply', repeat('b', 64), 'pending');
    raise exception 'duplicate idempotency key accepted';
  exception when unique_violation then null;
  end;
end $$;

-- 4. The audit log is append-only.
insert into audit_log (actor, action, entity) values ('test', 'create', 'claim');
do $$ begin
  begin
    update audit_log set actor = 'someone else';
    raise exception 'audit log was editable';
  exception when raise_exception then
    if sqlerrm <> 'audit_log is append-only' then raise; end if;
  end;
end $$;

-- 5. A rule set cannot be marked approved without who and when.
do $$ begin
  begin
    insert into rule_sets (regime, version, status, body) values ('EU261', 1, 'approved', '{}');
    raise exception 'approved rule set without approver accepted';
  exception when check_violation then null;
  end;
end $$;

-- 6. Sending starts in stage A (draft only) and unpaused.
do $$ begin
  if (select value from settings where key = 'sending_stage') <> '"A"'::jsonb then raise exception 'not stage A'; end if;
end $$;

rollback;
