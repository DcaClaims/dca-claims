// Prints SQL that loads the invented demo cases into the database, so the working screens can be tried safely.
// Re-running replaces the demo rows. Usage: node scripts/demo-seed.ts > seed.sql
import { CASES, CASE_VERSIONS, DRAFTS, MESSAGES } from '../src/demo/data.ts';

const q = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replaceAll("'", "''")}'`;
};
const id = (key: string) => `md5('dca-demo:${key}')::uuid`;
const arr = (xs: string[]) => `array[${xs.map(q).join(',')}]::text[]`;
const json = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;

const out: string[] = ['begin;', '-- remove earlier demo rows'];
const claimIds = CASES.map((c) => id(c.record.claimId));
out.push(`delete from drafts where claim_id in (${claimIds.join(',')});`);
out.push(`delete from messages where id in (${MESSAGES.map((m) => id(m.id)).join(',')});`);
out.push(`delete from claims where id in (${claimIds.join(',')});`);
out.push(`delete from bookings where id in (${CASES.map((c) => id('b' + c.record.claimId)).join(',')});`);
out.push(`delete from clients where id in (${[...new Set(CASES.map((c) => id('cl' + c.clientName)))].join(',')});`);

const seenClients = new Set<string>();
for (const c of CASES) {
  const k = c.record.claimId;
  const clientKey = 'cl' + c.clientName;
  if (!seenClients.has(clientKey)) {
    seenClients.add(clientKey);
    out.push(`insert into clients (id, full_name, language) values (${id(clientKey)}, ${q(c.clientName)}, ${q(c.language)});`);
    for (const e of c.record.clientEmails) out.push(`insert into client_emails (client_id, email) values (${id(clientKey)}, ${q(e)}) on conflict do nothing;`);
  }
  out.push(`insert into bookings (id, pnr, single_reservation) values (${id('b' + k)}, ${q(c.record.pnr ?? null)}, ${q(c.assessment.singleReservation)});`);
  c.passengers.forEach((p, n) =>
    out.push(`insert into passengers (id, booking_id, client_id, full_name, is_infant) values (${id(`p${k}-${n}`)}, ${id('b' + k)}, ${id(clientKey)}, ${q(p.name)}, ${q(!!p.isInfant)});`));
  c.assessment.sectors.forEach((s, n) =>
    out.push(`insert into sectors (id, booking_id, seq, flight_no, operating_carrier, dep_iata, arr_iata, sched_dep, sched_arr) values (${id(`s${k}-${n}`)}, ${id('b' + k)}, ${n + 1}, ${q(s.flightNo)}, ${q(s.operatingCarrier ?? null)}, ${q(s.dep)}, ${q(s.arr)}, ${q(s.schedDep ?? null)}, ${q(s.schedArr ?? null)});`));
  const d = c.assessment.disruption;
  out.push(`insert into disruptions (id, booking_id, sector_id, kind, notice_days, reroute_dep, reroute_arr, final_arrival, final_arrival_source, extraordinary) values (${id('d' + k)}, ${id('b' + k)}, ${id(`s${k}-${d.sectorIndex}`)}, ${q(d.kind)}, ${q(d.noticeDays ?? null)}, ${q(d.reroute?.dep ?? null)}, ${q(d.reroute?.arr ?? null)}, ${q(d.finalArrival ?? null)}, ${q(d.finalArrivalSource ?? null)}, ${q(d.extraordinary ?? null)});`);
  out.push(`insert into claims (id, booking_id, client_id, airline, airline_case_ref, authority_case_ref, regime_pursued, status, next_action, next_action_due, title, upload_token, lead_flags, waiting_on_us_since, notes) values (${id(k)}, ${id('b' + k)}, ${id(clientKey)}, ${q(c.record.airline)}, ${q(c.record.airlineCaseRef ?? null)}, ${q(c.record.authorityCaseRef ?? null)}, ${q(c.regimePursued ?? null)}, ${q(c.isLead ? 'new_lead' : c.status)}, ${q(c.nextAction)}, ${q(c.nextActionDue)}, ${q(c.title.replace(' (new lead)', ''))}, ${q(c.uploadLink ? c.uploadLink.split('/').pop() : null)}, ${json(c.acceptanceExtras ?? {})}, ${q(c.waitingOnUsSince ?? null)}, ${q(c.notes ?? null)});`);
  c.passengers.forEach((_, n) => out.push(`insert into claim_passengers (claim_id, passenger_id) values (${id(k)}, ${id(`p${k}-${n}`)});`));
  for (const dl of c.deadlines) out.push(`insert into deadlines (claim_id, kind, due_date, basis) values (${id(k)}, ${q(dl.kind)}, ${q(dl.due)}, ${q(dl.basis)});`);
  c.documents.forEach((doc, n) =>
    out.push(`insert into documents (claim_id, kind, original_filename, storage_path, sha256, bytes, created_at) values (${id(k)}, ${q(doc.kind)}, ${q(doc.name)}, ${q(`demo/${k}/${n}-${doc.name}`)}, ${q('0'.repeat(64))}, 0, ${q(doc.received)});`));
  if (c.terms.acceptedOn) out.push(`insert into fee_agreements (claim_id, tnc_version, fee_rate, applies_to, signed_at) values (${id(k)}, 'demo', 0.25, '{compensation,expenses}', ${q(c.terms.acceptedOn)});`);
  for (const a of c.facts.amounts) out.push(`insert into case_facts (claim_id, kind, amount, currency, what) values (${id(k)}, 'amount', ${a.value}, ${q(a.currency)}, ${q(a.what)});`);
  for (const dt of c.facts.dates) out.push(`insert into case_facts (claim_id, kind, on_date, what) values (${id(k)}, 'date', ${q(dt.iso)}, ${q(dt.what)});`);
}
for (const m of MESSAGES) {
  out.push(`insert into messages (id, mailbox, direction, rfc_message_id, in_reply_to, references_ids, from_address, from_name, to_addresses, subject, body_text, received_at, attachments, headers) values (${id(m.id)}, ${q(m.mailbox)}, 'in', ${q(m.rfcMessageId)}, ${q(m.inReplyTo ?? null)}, ${arr(m.references ?? [])}, ${q(m.from.address)}, ${q(m.from.name ?? null)}, ${arr(m.to)}, ${q(m.subject)}, ${q(m.bodyText)}, ${q(m.receivedAt)}, ${json(m.attachments ?? [])}, ${json(m.headers ?? {})});`);
}
// Drafts last, pinned to each case's version now (an "outdated" demo draft is pinned one version back).
for (const d of DRAFTS) {
  const stale = d.basedOnVersion < (CASE_VERSIONS[d.claimId] ?? 0);
  out.push(`insert into drafts (id, claim_id, in_reply_to_message_id, to_addresses, subject, body, based_on_claim_version, status, created_by, kind, language) select ${id(d.id)}, c.id, ${d.inReplyTo ? id(d.inReplyTo) : 'null'}, ${arr([d.to])}, ${q(d.subject)}, ${q(d.body)}, c.version${stale ? ' - 1' : ''}, ${q(d.approved ? 'approved' : 'draft')}, 'ai', ${q(d.kind)}, ${q(d.language)} from claims c where c.id = ${id(d.claimId)};`);
}
out.push('commit;');
console.log(out.join('\n'));
