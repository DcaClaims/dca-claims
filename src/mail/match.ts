// Classifies an incoming email and matches it to zero, one or several cases.
// Rule of thumb from the design: an uncertain message stays unassigned for review; it is never forced into a case.

import { detectSuspicious, domainOf, knownDomain } from './suspicious.ts';
import type { CaseMatch, CaseRecord, Directory, IncomingMessage, MatchResult } from './types.ts';

export const AUTO_ATTACH_SCORE = 80;
const NEAR_MISS_SCORE = 50;
const MARGIN = 40;

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const normText = (s: string) => s.toUpperCase().replace(/\s+/g, ' ');

/** Tokens of 5+ letters/digits in the text, normalised, for exact reference matching. */
function refTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.toUpperCase().matchAll(/[A-Z0-9][A-Z0-9\-\/:_.]{3,40}[A-Z0-9]/g)) {
    out.add(norm(m[0]));
    // also split on separators: "CRM:12345678" → "12345678"
    for (const part of m[0].split(/[\-\/:_.]/)) if (part.length >= 5) out.add(norm(part));
  }
  return out;
}

const CLAIM_WORDS = /\b(flight|delay(ed)?|cancel(l?ed|lation)?|compensation|claim|missed connection|denied boarding|overbook(ed)?|lost (bag|luggage)|baggage|airline|vol|retard|annul[ée]|indemnisation)\b|טיסה|עיכוב|ביטול|פיצוי|מזוודה/i;
const FLIGHT_NO = /\b([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?\d{1,4}\b/;

/** A stored reference and its meaningful parts, e.g. "CRM:00991234" → CRM00991234, 00991234. */
function refVariants(ref: string): string[] {
  const parts = ref.split(/[\s:\-\/_.#]+/).map(norm).filter((p) => p.length >= 5);
  return [...new Set([norm(ref), ...parts])].filter((v) => v.length >= 5);
}

/** Flight numbers mentioned in the text, normalised (e.g. "LH 2504" → "LH2504"). Ignores EU261/UK261. */
function mentionedFlights(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})\b/g)) {
    const f = m[1] + m[2];
    if (/^(EU|UK)261$/.test(f) || /^(EU|UK|EC|TO|NO|IN|IS|AT|ON|OR|IT|AM|PM)\d{1,2}$/.test(f)) continue;
    out.add(f);
  }
  return [...out];
}

function isBulk(msg: IncomingMessage): string | null {
  const h = Object.fromEntries(Object.entries(msg.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
  if (h['list-unsubscribe']) return 'has an unsubscribe header (newsletter or marketing)';
  if (h['precedence'] && /bulk|list|junk/.test(h['precedence'])) return `precedence: ${h['precedence']}`;
  if (/\bunsubscribe\b|view (this email )?in (your )?browser|manage (your )?preferences/i.test(msg.bodyText)) return 'marketing footer';
  return null;
}
function isAutoReply(msg: IncomingMessage): boolean {
  const h = Object.fromEntries(Object.entries(msg.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
  return (!!h['auto-submitted'] && h['auto-submitted'] !== 'no') || /^(auto(matic)?[ -]?reply|out of (the )?office)/i.test(msg.subject);
}

export function matchMessage(msg: IncomingMessage, cases: CaseRecord[], dir: Directory): MatchResult {
  const suspicious = detectSuspicious(msg, dir);
  const text = [msg.subject, msg.bodyText, ...(msg.attachments ?? []).map((a) => a.text ?? '')].join('\n');
  const upper = normText(text);
  const tokens = refTokens(text);
  const fromAddr = msg.from.address.trim().toLowerCase();
  const fromDomain = domainOf(fromAddr);
  const party = dir.parties.find((p) => fromDomain === p.domain || fromDomain.endsWith('.' + p.domain));
  const threadIds = new Set([msg.inReplyTo, ...(msg.references ?? [])].filter(Boolean) as string[]);

  const openByClient = new Map<string, number>();
  for (const c of cases) if (c.open) for (const e of c.clientEmails) openByClient.set(e.toLowerCase(), (openByClient.get(e.toLowerCase()) ?? 0) + 1);

  const scored: (CaseMatch & { unique: boolean })[] = [];
  for (const c of cases) {
    let score = 0;
    let unique = false;
    const reasons: string[] = [];
    const add = (n: number, why: string, isUnique = false) => { score += n; reasons.push(why); unique ||= isUnique; };

    if (c.messageIds.some((id) => threadIds.has(id))) add(100, 'reply in an existing thread of this case', true);
    const dcaRef = new RegExp(`\\bDCA[-\\s#]?${c.ref}\\b`, 'i');
    if (dcaRef.test(text)) add(100, `DCA claim number ${c.ref} quoted`, true);
    if (c.airlineCaseRef && refVariants(c.airlineCaseRef).some((v) => tokens.has(v))) add(100, `airline reference ${c.airlineCaseRef}`, true);
    if (c.authorityCaseRef && refVariants(c.authorityCaseRef).some((v) => tokens.has(v))) add(100, `authority reference ${c.authorityCaseRef}`, true);

    const pnrHit = !!c.pnr && new RegExp(`\\b${norm(c.pnr)}\\b`).test(upper);
    const surnameHit = c.passengerNames.some((n) => {
      const surname = n.trim().split(/\s+/).pop() ?? '';
      return surname.length >= 3 && new RegExp(`\\b${surname.toUpperCase()}\\b`).test(upper);
    });
    if (pnrHit) add(50, `booking reference ${c.pnr}`);
    if (pnrHit && surnameHit) add(40, 'passenger surname with the booking reference');

    if (c.clientEmails.some((e) => e.toLowerCase() === fromAddr)) {
      const open = openByClient.get(fromAddr) ?? 0;
      const own = new Set(c.flightNos.map((f) => norm(f)));
      const foreign = mentionedFlights(text).filter((f) => !own.has(f));
      if (c.open && open === 1 && foreign.length === 0) add(80, 'sent by the client, who has one open case');
      else if (foreign.length) add(30, `sent by the client, but mentions another flight (${foreign.join(', ')})`);
      else add(30, `sent by the client, who has ${open} open cases`);
    }
    const fullName = c.passengerNames.some((n) => n.trim().split(/\s+/).length >= 2 && upper.includes(normText(n.trim())));
    if (fullName) add(30, 'passenger full name');
    if (c.flightNos.some((f) => new RegExp(`\\b${f.replace(/\s+/g, '').replace(/^([A-Z0-9]{2})/i, '$1\\s?')}\\b`, 'i').test(text))) add(15, 'flight number');
    if (party && party.kind === 'airline' && party.code === c.airline) add(10, `from ${party.name}`);

    if (score > 0) scored.push({ claimId: c.claimId, score, reasons, unique });
  }
  scored.sort((a, b) => b.score - a.score);
  const candidates: CaseMatch[] = scored.map(({ claimId, score, reasons }) => ({ claimId, score, reasons }));

  const basis: string[] = [];
  const lookalike = suspicious.some((s) => s.kind === 'lookalike_domain' || s.kind === 'name_spoof');

  // 1. Case mail.
  const strong = scored.filter((s) => s.score >= AUTO_ATTACH_SCORE);
  if (strong.length) {
    if (lookalike) {
      basis.push('matches a case but the sender looks like an impersonation, so it is held for review');
      return { classification: 'uncertain', attachTo: [], candidates, basis, suspicious };
    }
    // If any case is identified by a unique reference, only those cases are meant.
    const chosen = strong.some((s) => s.unique) ? strong.filter((s) => s.unique) : strong;
    const chosenIds = new Set(chosen.map((s) => s.claimId));
    // A rival close behind the weakest chosen case means we cannot tell them apart (unless a unique reference decided it).
    const weakest = Math.min(...chosen.map((c) => c.score));
    const nearMiss = chosen.some((c) => c.unique) ? undefined
      : scored.find((s) => !chosenIds.has(s.claimId) && s.score >= NEAR_MISS_SCORE && weakest - s.score < MARGIN);
    if (nearMiss) {
      basis.push(`two or more cases fit (best ${chosen[0].score}, next ${nearMiss.score}); held for review`);
      return { classification: 'uncertain', attachTo: [], candidates, basis, suspicious };
    }
    basis.push(chosen.length > 1 ? `concerns ${chosen.length} cases` : 'matches one case');
    return { classification: 'case', attachTo: chosen.map(({ claimId, score, reasons }) => ({ claimId, score, reasons })), candidates, basis, suspicious };
  }

  // 2. Something points at a case, or comes from a party we deal with, but not strongly enough.
  if (scored.some((s) => s.score >= NEAR_MISS_SCORE)) {
    basis.push('partly matches a case; held for review');
    return { classification: 'uncertain', attachTo: [], candidates, basis, suspicious };
  }
  if (party) {
    basis.push(`from ${party.name} but no case reference found; held for review`);
    return { classification: 'uncertain', attachTo: [], candidates, basis, suspicious };
  }
  if (openByClient.has(fromAddr) || cases.some((c) => c.clientEmails.some((e) => e.toLowerCase() === fromAddr))) {
    basis.push('from an existing client but not clearly about one case; held for review');
    return { classification: 'uncertain', attachTo: [], candidates, basis, suspicious };
  }

  // 3. Not about a known case.
  const bulk = isBulk(msg);
  if (bulk && !knownDomain(fromDomain, dir)) {
    basis.push(`looks like bulk mail: ${bulk}`);
    return { classification: 'spam', attachTo: [], candidates, basis, suspicious };
  }
  if (isAutoReply(msg)) {
    basis.push('automatic reply from an unknown sender');
    return { classification: 'unrelated', attachTo: [], candidates, basis, suspicious };
  }
  if (CLAIM_WORDS.test(text) || FLIGHT_NO.test(msg.subject)) {
    basis.push('unknown sender writing about a flight problem');
    return { classification: 'new_enquiry', attachTo: [], candidates, basis, suspicious };
  }
  basis.push('could not tell what this is; held for review');
  return { classification: 'uncertain', attachTo: [], candidates, basis, suspicious };
}
