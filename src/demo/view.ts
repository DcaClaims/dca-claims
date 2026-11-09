// Builds what the screens show from the (demo) data, using the real rules engine, matcher and checks.
// When the database is connected, only the data source changes; these functions stay.

import { assess, type Assessment } from '../rules/assess.ts';
import { matchMessage } from '../mail/match.ts';
import type { MatchResult } from '../mail/types.ts';
import { checkDraft, type DraftFlag } from '../drafting/guard.ts';
import { leadFromEmail, leadFromForm, type LeadDecision } from '../intake/lead.ts';
import { CASES, CASE_VERSIONS, DEMO_NOW, DIRECTORY, DRAFTS, FORM_SUBMISSIONS, MESSAGES, type DemoCase, type DemoDraft } from './data.ts';

export const now = () => DEMO_NOW;
export const allCases = () => CASES;
export const caseById = (id: string) => CASES.find((c) => c.record.claimId === id) ?? null;
export const caseByRef = (ref: number) => CASES.find((c) => c.record.ref === ref) ?? null;

const assessmentCache = new Map<string, Assessment>();
export function assessmentFor(c: DemoCase): Assessment {
  let a = assessmentCache.get(c.record.claimId);
  if (!a) {
    a = assess({ ...c.assessment, passenger: { isInfant: c.passengers.some((p) => p.isInfant) } });
    assessmentCache.set(c.record.claimId, a);
  }
  return a;
}

/** The headline figure for a case: the pursued regime's journey-view result (or the best covered one). */
export function headline(c: DemoCase) {
  const a = assessmentFor(c);
  const covered = a.results.filter((r) => r.outcome === 'potentially_covered');
  const pick =
    covered.find((r) => r.regime === c.regimePursued && r.view === 'journey') ??
    covered.find((r) => r.regime === c.regimePursued) ??
    covered[0] ??
    a.results.find((r) => r.outcome === 'insufficient_information') ??
    a.results[0];
  const paying = c.passengers.filter((p) => !p.isInfant).length;
  // Once you've chosen which law to pursue, "more than one law may apply" is no longer something to review.
  const flags = c.regimePursued ? a.flags.filter((f) => !f.startsWith('More than one regime')) : a.flags;
  const alternatives = c.regimePursued ? covered.filter((r) => r.regime !== pick.regime) : [];
  return { result: pick, perPassenger: pick.amount, total: pick.amount === null ? null : pick.amount * paying, paying, flags, alternatives,
    needsReview: flags.length > 0 || a.results.some((r) => r.needsReview && r.outcome === 'potentially_covered') };
}

export type InboxItem = {
  kind: 'email' | 'form';
  id: string;
  receivedAt: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  preview: string;
  match?: MatchResult;
  lead: LeadDecision;
  classification: MatchResult['classification'] | 'form_review' | 'form_spam' | 'form_lead';
  rtl: boolean;
};

const hebrew = /[֐-׿]/;

export function inbox(): InboxItem[] {
  const records = CASES.map((c) => c.record);
  const emails: InboxItem[] = MESSAGES.map((m) => {
    const match = matchMessage(m, records, DIRECTORY);
    return {
      kind: 'email', id: m.id, receivedAt: m.receivedAt, fromName: m.from.name ?? m.from.address, fromAddress: m.from.address,
      subject: m.subject, preview: m.bodyText.slice(0, 140), match, lead: leadFromEmail(match), classification: match.classification,
      rtl: hebrew.test(m.subject + m.bodyText),
    };
  });
  const forms: InboxItem[] = FORM_SUBMISSIONS.map((f) => {
    const lead = leadFromForm(f);
    return {
      kind: 'form', id: f.id, receivedAt: f.receivedAt, fromName: f.name ?? '(no name)', fromAddress: f.email ?? '',
      subject: 'Website form', preview: f.message ?? '', lead,
      classification: lead.action === 'spam' ? 'form_spam' : lead.action === 'create_lead' ? 'form_lead' : 'form_review',
      rtl: hebrew.test(f.message ?? ''),
    };
  });
  return [...emails, ...forms].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export const messageById = (id: string) => MESSAGES.find((m) => m.id === id) ?? null;

export type DraftView = DemoDraft & {
  case: DemoCase;
  flags: DraftFlag[];
  stale: boolean;
  state: 'stale' | 'needs_checking' | 'ready';
};

export function drafts(): DraftView[] {
  return DRAFTS.map((d) => {
    const c = caseById(d.claimId)!;
    const others = CASES.filter((x) => x.record.claimId !== d.claimId).map((x) => x.facts);
    const flags = checkDraft(d.body, c.facts, others);
    const stale = d.basedOnVersion < (CASE_VERSIONS[d.claimId] ?? 0);
    return { ...d, case: c, flags, stale, state: stale ? 'stale' : flags.length ? 'needs_checking' : 'ready' };
  });
}

export type TodayItem = {
  group: 'alert' | 'deadline' | 'client_waiting' | 'approval' | 'review' | 'chase';
  title: string;
  detail: string;
  due?: string;
  href: string;
  urgency: 'overdue' | 'today' | 'soon' | 'later';
};

const day = (iso: string) => iso.slice(0, 10);
function urgency(due: string): TodayItem['urgency'] {
  const today = day(now());
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  const diff = (Date.parse(due) - Date.parse(today)) / 86_400_000;
  return diff <= 7 ? 'soon' : 'later';
}

/** What needs the owner today, most important first: legal deadlines, clients waiting, approvals, review, chasing. */
export function today(): TodayItem[] {
  const items: TodayItem[] = [];
  for (const c of CASES) {
    for (const d of c.deadlines) {
      const u = urgency(d.due);
      const window = d.kind === 'limitation' ? 60 : 14;
      if ((Date.parse(d.due) - Date.parse(day(now()))) / 86_400_000 > window) continue;
      if (d.kind === 'client_chase') continue;
      items.push({ group: 'deadline', title: `${c.title}: ${labelDeadline(d.kind).toLowerCase()}`, detail: d.basis, due: d.due, href: `/cases/${c.record.claimId}`, urgency: u });
    }
    if (c.waitingOnUsSince) {
      items.push({ group: 'client_waiting', title: `${c.clientName} is waiting for a reply`, detail: `waiting since ${c.waitingOnUsSince}`, due: c.nextActionDue, href: `/cases/${c.record.claimId}`, urgency: urgency(c.nextActionDue) });
    }
    for (const d of c.deadlines.filter((x) => x.kind === 'client_chase')) {
      items.push({ group: 'chase', title: `${c.title}: ${c.nextAction}`, detail: d.basis, due: d.due, href: `/cases/${c.record.claimId}`, urgency: urgency(d.due) });
    }
  }
  for (const d of drafts()) {
    items.push({
      group: 'approval', title: `Approve: ${d.subject}`, href: '/approvals', urgency: d.state === 'stale' ? 'soon' : 'today',
      detail: d.state === 'stale' ? 'case changed since this was approved: review again' : d.flags.length ? `${d.flags.length} statement(s) to check` : 'ready to approve',
    });
  }
  for (const i of inbox()) {
    const s = i.match?.suspicious ?? [];
    if (!s.length) continue;
    const bank = s.some((x) => x.kind === 'bank_change');
    const spoof = s.some((x) => x.kind === 'lookalike_domain' || x.kind === 'name_spoof');
    items.push({
      group: 'alert',
      title: spoof ? `Possible impersonation: ${i.fromAddress}` : `Suspicious content in a message from ${i.fromName}`,
      detail: [...new Set(s.map((x) => x.detail))].join('; ') + (bank ? '. Never change bank details from an email.' : ''),
      href: `/inbox/${i.id}`, urgency: 'today',
    });
  }
  const review = inbox().filter((i) => i.lead.action === 'review');
  if (review.length) items.push({ group: 'review', title: `${review.length} messages need you to decide`, detail: 'not matched to a case with confidence', href: '/inbox?tab=review', urgency: 'today' });
  const order = { overdue: 0, today: 1, soon: 2, later: 3 };
  const groupOrder = { alert: 0, deadline: 1, client_waiting: 2, approval: 3, review: 4, chase: 5 };
  return items.sort((a, b) => order[a.urgency] - order[b.urgency] || groupOrder[a.group] - groupOrder[b.group]);
}

export function labelDeadline(k: string) {
  return ({ airline_followup: 'Airline payment deadline', adr: 'Escalation deadline', limitation: 'Legal time limit', client_chase: 'Chase client' } as Record<string, string>)[k] ?? k;
}

export function health() {
  return {
    sendingStage: 'A' as const,
    paused: false,
    mailbox: 'not connected (demo data)',
    failedAutomations: 0,
    lastBackup: 'not set up yet',
  };
}
