import type { ReactNode } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "8 Nov 2026" (dates) or "8 Nov, 14:05" (times, shown in Israel time). Fixed format so server and browser agree. */
export function fmtDate(iso: string, withTime = false): string {
  if (!withTime) {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month')}, ${get('hour')}:${get('minute')}`;
}

const SYMBOL: Record<string, string> = { EUR: '€', GBP: '£', ILS: '₪', USD: '$' };
export function money(amount: number | null, currency: string): string {
  if (amount === null) return 'not established';
  return `${SYMBOL[currency] ?? currency + ' '}${amount.toLocaleString('en-GB')}`;
}

export function Pill({ tone, children }: { tone: 'ok' | 'bad' | 'warn' | 'info' | 'plain'; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export const CLASS_LABEL: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' | 'info' | 'plain' }> = {
  case: { label: 'Matched to case', tone: 'ok' },
  new_enquiry: { label: 'New enquiry', tone: 'info' },
  spam: { label: 'Spam', tone: 'plain' },
  unrelated: { label: 'Unrelated', tone: 'plain' },
  uncertain: { label: 'Needs review', tone: 'warn' },
  form_review: { label: 'Form: needs review', tone: 'warn' },
  form_spam: { label: 'Form: spam', tone: 'plain' },
  form_lead: { label: 'Form: new lead', tone: 'info' },
};

export const OUTCOME_LABEL: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' }> = {
  potentially_covered: { label: 'Potentially covered', tone: 'ok' },
  not_covered: { label: 'Not covered', tone: 'bad' },
  insufficient_information: { label: 'Insufficient information', tone: 'warn' },
};

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h1>{title}</h1>
      {sub ? <p className="muted">{sub}</p> : null}
      {children}
    </div>
  );
}
