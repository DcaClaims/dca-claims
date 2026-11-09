// How DCA writes, per recipient. These instructions go to the drafting AI, and `checkStyle` checks every draft
// against the parts that can be checked mechanically. Source: the owner's own messages (practice-rules doc, 4–9 Nov 2026).

export type Recipient = 'airline' | 'authority' | 'client_first_reply' | 'client' | 'client_upload_request' | 'lawyers';

export const STYLE: Record<Recipient, string[]> = {
  airline: [
    'Firm and formal. Never a gentle push back: "I always like a reference and a clear threat for escalation".',
    'State that DCA Ventures Ltd is a registered company acting under the client\'s signed letter of authority, attached with passports.',
    'Answer the airline\'s stated reason directly and cite the law (and a court decision where it helps).',
    'End with a deadline (14 days, or the airline playbook\'s period) and the next step: refer to the CAA / CEDR / AviationADR and issue legal proceedings without further notice.',
    'For ASL claims, warn about Section 11 exemplary damages.',
    'For El Al: we act for the client; never describe the claim as assigned to DCA.',
  ],
  authority: [
    'Address the adjudicator, not the airline, and ask them to reject the airline\'s defence.',
    'Short numbered points answering each argument; attach evidence.',
  ],
  client_first_reply: [
    'Short, casual and human. Apologise if the reply is late.',
    'Say what they are likely due ("up to £520 per passenger, depending on the circumstances").',
    'State the fee: 25%, no win no fee (plus VAT only if the claim goes to the Israeli lawyers).',
    'Give their personal upload link: the upload page has the T&Cs tick box, so accepting there is the normal route (owner, 9 Nov 2026).',
    'Say they can instead reply by email with the documents attached, but then they must confirm in the email that they accept the T&Cs and the fee.',
    'Write in Hebrew to Hebrew writers; Hebrew letters use numeric dates (17.10.2026).',
  ],
  client_upload_request: [
    'Give their personal upload link and list exactly what to upload for this airline (booking confirmation, passports, signed forms the playbook requires, receipts).',
    'If they have not accepted the T&Cs yet, remind them the upload page asks for it (or to confirm by email if they send documents by email).',
  ],
  client: ['Short and plain. Say what happened, what happens next and when.'],
  lawyers: ['Hebrew case brief, not a court letter: numbered paragraphs, client details, times, timeline, airline defences, amounts with calculation, expenses, Section 11 note.'],
};

export type StyleFlag = { rule: string; detail: string };

const DEADLINE = /\b(within|in)\s+\d{1,2}\s+(days|working days|business days)\b|\bby\s+\d{1,2}\s+\w+\s+\d{4}\b|בתוך\s+\d+\s+(יום|ימים)/i;
const ESCALATION = /\b(CAA|CEDR|AviationADR|Aviation ADR|ADR|county court|small claims|legal proceedings|proceedings|court|lawyers?)\b|בית משפט|עורכי הדין|תביעה/i;
const NO_FURTHER_NOTICE = /without further notice|ללא הודעה נוספת/i;
const FEE = /25\s?%/;
const TERMS = /terms\s*(&|and)\s*conditions|T&Cs?|T\s?&\s?C|תנאי(ם)?|תקנון/i;
const LINK = /https?:\/\/\S+/;
const ASSIGNMENT = /\bassign(ed|ment)?\b|המח(ה|את)/i;

/** Mechanical checks of a draft against the house style. Returns what is missing; empty means fine. */
export function checkStyle(kind: Recipient, body: string, opts: { airline?: string; clientAcceptedTerms?: boolean } = {}): StyleFlag[] {
  const out: StyleFlag[] = [];
  if (kind === 'airline') {
    if (!DEADLINE.test(body)) out.push({ rule: 'deadline', detail: 'no deadline for the airline to reply or pay' });
    if (!ESCALATION.test(body)) out.push({ rule: 'escalation', detail: 'no escalation step named (CAA, CEDR, ADR or legal proceedings)' });
    else if (!NO_FURTHER_NOTICE.test(body)) out.push({ rule: 'firmness', detail: 'escalation is not stated as "without further notice"' });
    if (opts.airline === 'LY' && ASSIGNMENT.test(body)) out.push({ rule: 'el_al_assignment', detail: 'mentions assignment; for El Al we act for the client' });
  }
  if (kind === 'client_first_reply') {
    if (!FEE.test(body)) out.push({ rule: 'fee', detail: 'does not state the 25% no win no fee charge' });
    if (!LINK.test(body)) out.push({ rule: 'upload_link', detail: 'no personal upload link (where the client accepts the T&Cs)' });
    if (!TERMS.test(body)) out.push({ rule: 'terms', detail: 'does not mention the Terms & Conditions' });
  }
  if (kind === 'client_upload_request') {
    if (!LINK.test(body)) out.push({ rule: 'upload_link', detail: 'no personal upload link' });
    if (opts.clientAcceptedTerms === false && !TERMS.test(body)) out.push({ rule: 'terms', detail: 'client has not accepted the T&Cs yet and the email does not mention them' });
  }
  return out;
}
