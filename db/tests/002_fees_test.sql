begin;
insert into bookings (id) values ('00000000-0000-0000-0000-0000000000b2');
insert into claims (id, booking_id, airline) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 'LY');
insert into fee_agreements (claim_id, tnc_version, fee_rate, applies_to, vat_rate)
  values ('00000000-0000-0000-0000-0000000000c2', 'test', 0.25, '{compensation,expenses}', 0.18);
do $$ begin
  if (select lawyers_used from fee_agreements limit 1) then raise exception 'lawyers_used should default to false'; end if;
end $$;
rollback;
