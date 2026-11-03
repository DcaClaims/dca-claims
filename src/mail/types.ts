export type IncomingMessage = {
  id: string;
  mailbox: string;
  rfcMessageId: string;
  inReplyTo?: string | null;
  references?: string[];
  from: { address: string; name?: string | null };
  to: string[];
  subject: string;
  bodyText: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; text?: string | null }[];
};

/** What the matcher knows about each case. Built from the database. */
export type CaseRecord = {
  claimId: string;
  ref: number;                    // DCA claim number
  legacyRef?: string | null;      // Airtable number, e.g. "161"
  pnr?: string | null;
  airline: string;                // IATA code
  airlineCaseRef?: string | null;
  authorityCaseRef?: string | null;
  clientEmails: string[];
  passengerNames: string[];
  flightNos: string[];
  open: boolean;
  /** Message-IDs of messages already linked to this case, in or out. */
  messageIds: string[];
};

/** Domains of airlines and authorities, and DCA's own domains. */
export type Directory = {
  parties: { domain: string; kind: 'airline' | 'authority'; code: string; name: string }[];
  ownDomains: string[];
};

export type Classification = 'case' | 'new_enquiry' | 'spam' | 'unrelated' | 'uncertain';

export type CaseMatch = { claimId: string; score: number; reasons: string[] };

export type Suspicion = { kind: 'instruction' | 'bank_change' | 'lookalike_domain' | 'name_spoof'; detail: string; where: string };

export type MatchResult = {
  classification: Classification;
  /** Cases the message is attached to automatically (may be several, e.g. a family). Empty unless classification is 'case'. */
  attachTo: CaseMatch[];
  /** All candidates considered, best first, for the review screen. */
  candidates: CaseMatch[];
  basis: string[];
  suspicious: Suspicion[];
};
