// Turns database rows into the dataset the screens use. Pure (no database access), so it can be tested.
import type { Dataset } from '../demo/view.ts';
import type { DemoCase, DemoDraft, Language } from '../demo/data.ts';
import { DIRECTORY } from '../demo/data.ts';

type Row = Record<string, any>;
export type Tables = {
  claims: Row[]; bookings: Row[]; passengers: Row[]; claim_passengers: Row[]; sectors: Row[]; disruptions: Row[];
  deadlines: Row[]; documents: Row[]; fee_agreements: Row[]; case_facts: Row[]; clients: Row[]; client_emails: Row[];
  messages: Row[]; message_claims: Row[]; drafts: Row[];
};

const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(String(v)).toISOString());
const day = (v: unknown) => (v === null || v === undefined ? null : String(v).slice(0, 10));
const by = <T extends Row>(rows: T[], key: string) => {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(r[key], [...(m.get(r[key]) ?? []), r]);
  return m;
};

export function buildDataset(t: Tables, now: string): Dataset {
  const bookings = new Map(t.bookings.map((b) => [b.id, b]));
  const clients = new Map(t.clients.map((c) => [c.id, c]));
  const emailsByClient = by(t.client_emails, 'client_id');
  const passengers = new Map(t.passengers.map((p) => [p.id, p]));
  const cpByClaim = by(t.claim_passengers, 'claim_id');
  const sectorsByBooking = by(t.sectors, 'booking_id');
  const disByBooking = by(t.disruptions, 'booking_id');
  const deadlinesByClaim = by(t.deadlines, 'claim_id');
  const docsByClaim = by(t.documents, 'claim_id');
  const feeByClaim = new Map(t.fee_agreements.map((f) => [f.claim_id, f]));
  const factsByClaim = by(t.case_facts, 'claim_id');
  const linksByMessage = by(t.message_claims, 'message_id');
  const messagesById = new Map(t.messages.map((m) => [m.id, m]));
  const linkedMessagesByClaim = by(t.message_claims, 'claim_id');

  const cases: DemoCase[] = t.claims.map((c) => {
    const b = bookings.get(c.booking_id) ?? {};
    const client = clients.get(c.client_id) ?? {};
    const emails = (emailsByClient.get(c.client_id) ?? []).map((e) => e.email);
    const pax = (cpByClaim.get(c.id) ?? []).map((cp) => passengers.get(cp.passenger_id)).filter(Boolean) as Row[];
    const sectors = [...(sectorsByBooking.get(c.booking_id) ?? [])].sort((x, y) => x.seq - y.seq);
    const dis = (disByBooking.get(c.booking_id) ?? [])[0] ?? {};
    const sectorIndex = Math.max(0, sectors.findIndex((s) => s.id === dis.sector_id));
    const fee = feeByClaim.get(c.id);
    const facts = factsByClaim.get(c.id) ?? [];
    const messageIds = (linkedMessagesByClaim.get(c.id) ?? []).map((l) => messagesById.get(l.message_id)?.rfc_message_id).filter(Boolean);
    const names = pax.map((p) => p.full_name);
    const amounts = facts.filter((f) => f.kind === 'amount').map((f) => ({ value: Number(f.amount), currency: String(f.currency).trim(), what: f.what }));
    const dates = facts.filter((f) => f.kind === 'date').map((f) => ({ iso: day(f.on_date)!, what: f.what }));
    const isLead = c.status === 'new_lead';
    return {
      record: {
        claimId: c.id, ref: Number(c.ref), legacyRef: c.legacy_ref, pnr: b.pnr ?? null, airline: c.airline,
        airlineCaseRef: c.airline_case_ref, authorityCaseRef: c.authority_case_ref, clientEmails: emails,
        passengerNames: names, flightNos: sectors.map((s) => s.flight_no), open: !['closed_successfully', 'closed_unsuccessfully', 'declined'].includes(c.status),
        messageIds: messageIds as string[],
      },
      title: c.title ?? `${client.full_name ?? 'Client'} v ${c.airline}`,
      status: isLead ? 'New lead: your decision' : c.status,
      clientName: client.full_name ?? '',
      language: (client.language ?? 'en') as Language,
      passengers: pax.map((p) => ({ name: p.full_name, isInfant: !!p.is_infant })),
      assessment: {
        sectors: sectors.map((s) => ({ flightNo: s.flight_no, operatingCarrier: s.operating_carrier, dep: s.dep_iata, arr: s.arr_iata, schedDep: iso(s.sched_dep), schedArr: iso(s.sched_arr) })),
        singleReservation: b.single_reservation ?? null,
        disruption: {
          kind: dis.kind ?? 'delay', sectorIndex, noticeDays: dis.notice_days ?? null,
          reroute: dis.reroute_dep && dis.reroute_arr ? { dep: iso(dis.reroute_dep)!, arr: iso(dis.reroute_arr)! } : null,
          finalArrival: iso(dis.final_arrival), finalArrivalSource: dis.final_arrival_source ?? null, extraordinary: dis.extraordinary ?? undefined,
        },
      },
      regimePursued: c.regime_pursued ?? undefined,
      nextAction: c.next_action ?? '',
      nextActionDue: day(c.next_action_due) ?? day(now)!,
      deadlines: (deadlinesByClaim.get(c.id) ?? []).filter((d) => !d.closed_at).map((d) => ({ kind: d.kind, due: day(d.due_date)!, basis: d.basis })),
      documents: (docsByClaim.get(c.id) ?? []).map((d) => ({ name: d.original_filename, kind: d.kind, received: day(d.created_at)! })),
      facts: {
        claimId: c.id,
        identifiers: [b.pnr, c.airline_case_ref, c.authority_case_ref, ...emails, ...names].filter(Boolean),
        amounts, dates,
      },
      notes: c.notes ?? undefined,
      waitingOnUsSince: day(c.waiting_on_us_since) ?? undefined,
      terms: { acceptedOn: day(fee?.signed_at), fee: fee ? `${Math.round(Number(fee.fee_rate) * 100)}% no win no fee` : '25% no win no fee' },
      isLead,
      acceptanceExtras: c.lead_flags ?? {},
      uploadLink: c.upload_token ? `https://claims.dcaclaims.com/u/${c.upload_token}` : undefined,
    } satisfies DemoCase;
  });

  const messages = t.messages.filter((m) => m.direction === 'in').map((m) => {
    const manual = (linksByMessage.get(m.id) ?? []).filter((l) => l.matched_by === 'manual').map((l) => l.claim_id);
    return {
      id: m.id, mailbox: m.mailbox, rfcMessageId: m.rfc_message_id, inReplyTo: m.in_reply_to, references: m.references_ids ?? [],
      from: { address: m.from_address, name: m.from_name }, to: m.to_addresses ?? [], subject: m.subject ?? '', bodyText: m.body_text ?? '',
      headers: m.headers ?? {}, attachments: m.attachments ?? [], receivedAt: iso(m.received_at)!,
      manualClaimIds: manual.length ? manual : undefined, override: m.override ?? undefined, reviewed: !!m.reviewed_at,
    };
  });

  const drafts = t.drafts.map((d) => ({
    id: d.id, claimId: d.claim_id, inReplyTo: d.in_reply_to_message_id ?? undefined, to: (d.to_addresses ?? []).join(', '),
    subject: d.subject, body: d.body, language: (d.language ?? 'en') as Language, basedOnVersion: d.based_on_claim_version,
    approved: d.status === 'approved', kind: d.kind, status: d.status === 'discarded' ? 'discarded' : d.status === 'approved' ? 'approved' : 'draft',
  })) as (DemoDraft & { status: 'draft' | 'approved' | 'discarded' })[];

  const versions = Object.fromEntries(t.claims.map((c) => [c.id, Number(c.version)]));
  return { mode: 'live', now, cases, messages, forms: [], drafts, versions, directory: DIRECTORY };
}
