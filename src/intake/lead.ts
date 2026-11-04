// Decides whether something coming in becomes a new lead.
// Rule from the owner: obvious spam must never create a lead. It goes to a spam folder you can check
// (nothing is deleted); anything doubtful goes to the review queue instead of becoming a lead.

import type { MatchResult } from '../mail/types.ts';

export type LeadDecision = { action: 'create_lead' | 'review' | 'spam' | 'none'; reasons: string[] };

/** Email: only a clear new enquiry from a sender who doesn't look like an impersonation creates a lead. */
export function leadFromEmail(r: MatchResult): LeadDecision {
  switch (r.classification) {
    case 'new_enquiry':
      if (r.suspicious.length) return { action: 'review', reasons: ['new enquiry, but flagged: ' + r.suspicious.map((s) => s.detail).join('; ')] };
      return { action: 'create_lead', reasons: r.basis };
    case 'spam':
      return { action: 'spam', reasons: r.basis };
    case 'uncertain':
      return { action: 'review', reasons: r.basis };
    default:
      return { action: 'none', reasons: r.basis }; // case mail or unrelated
  }
}

export type FormSubmission = {
  name?: string;
  email?: string;
  phone?: string;
  airline?: string;
  flightNo?: string;
  flightDate?: string;
  claimType?: string;
  message?: string;
  pageUrl?: string;
  /** Hidden field real visitors never fill. */
  honeypot?: string;
};

const CLAIM_WORDS = /\b(flight|fly|flew|delay(ed)?|cancel(l?ed|lation)?|compensation|claim|missed|connection|boarding|overbook(ed)?|airline|airport|luggage|baggage|vol|retard)\b|טיסה|טסנו|עיכוב|ביטול|פיצוי|מזוודה|שדה תעופה/i;
const SPAM_WORDS = /\b(seo|backlinks?|crypto|bitcoin|forex|casino|loan|viagra|web ?design|rank(ing)? on google|marketing services|guest post|investment opportunity|whatsapp me for|telegram)\b/i;
const DISPOSABLE = ['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'yopmail.com', 'trashmail.com', 'sharklasers.com'];

const blank = (s?: string) => !s || !s.trim();

export function leadFromForm(f: FormSubmission): LeadDecision {
  const reasons: string[] = [];
  const msg = f.message ?? '';
  const domain = (f.email ?? '').toLowerCase().split('@')[1] ?? '';
  const hasFlightInfo = !blank(f.airline) || !blank(f.flightNo) || !blank(f.flightDate);
  const aboutFlights = CLAIM_WORDS.test(msg) || CLAIM_WORDS.test(f.claimType ?? '');
  const links = (msg.match(/https?:\/\/|www\./gi) ?? []).length;

  // Obvious spam: any one of these is enough.
  if (!blank(f.honeypot)) return { action: 'spam', reasons: ['hidden anti-spam field was filled (a bot)'] };
  if (SPAM_WORDS.test(msg) && !hasFlightInfo) return { action: 'spam', reasons: ['advertising or scam wording, no flight details'] };
  if (links >= 2 && !hasFlightInfo) return { action: 'spam', reasons: ['several links and no flight details'] };
  if (DISPOSABLE.includes(domain)) return { action: 'spam', reasons: [`throwaway email address (${domain})`] };
  if (blank(f.email) && blank(f.phone)) return { action: 'spam', reasons: ['no way to contact the sender'] };

  // Nothing about a flight at all: not a lead, but a person checks it (it may be a real client writing badly).
  if (!hasFlightInfo && !aboutFlights) {
    reasons.push('no airline, flight number or date, and the message is not about a flight');
    return { action: 'review', reasons };
  }
  if (links >= 1) reasons.push('contains a link');
  return { action: 'create_lead', reasons: reasons.length ? reasons : ['flight details or a flight problem described'] };
}
