import Link from 'next/link';
import type { ReactNode } from 'react';
import { drafts, health } from '../../src/demo/view.ts';
import { PageHead, Pill } from '../_components/ui';

/** Highlights each flagged text in the draft so you can see exactly what to check. */
function highlight(body: string, marks: string[]): ReactNode[] {
  if (!marks.length) return [body];
  const esc = marks.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${esc.join('|')})`, 'g');
  return body.split(re).map((part, n) => (marks.includes(part) ? <mark key={n}>{part}</mark> : part));
}

const KIND_LABEL: Record<string, string> = {
  airline: 'To airline', authority: 'To authority', client: 'To client', client_first_reply: 'First reply to new lead',
  client_upload_request: 'Upload request', lawyers: 'To lawyers',
};

const FLAG_TEXT = {
  other_case_data: 'belongs to another case',
  unsupported_amount: 'amount not in the case record',
  unsupported_date: 'date not in the case record',
};

export default function ApprovalsPage() {
  const list = drafts();
  const h = health();
  const order = { needs_checking: 0, stale: 1, ready: 2 };
  list.sort((a, b) => order[a.state] - order[b.state]);

  return (
    <>
      <PageHead
        title="Approvals"
        sub="You approve the exact message: recipient, text and attachments. Any change afterwards, or anything new on the case, needs a fresh approval."
      />
      {list.map((d) => (
        <div key={d.id} id={d.id} className="card">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {d.state === 'stale' ? <Pill tone="warn">Possibly outdated: the case changed after approval</Pill> : null}
            {d.state === 'needs_checking' ? <Pill tone="bad">{d.flags.length + d.styleFlags.length} point{d.flags.length + d.styleFlags.length > 1 ? 's' : ''} to check</Pill> : null}
            {d.state === 'ready' ? <Pill tone="ok">No problems found</Pill> : null}
            <Pill tone="plain">{KIND_LABEL[d.kind]}</Pill>
            {d.language === 'he' ? <Pill tone="plain">Hebrew</Pill> : null}
          </div>
          <h3>{d.subject}</h3>
          <div className="small muted">
            To {d.to} · <Link href={`/cases/${d.claimId}`}>#{d.case.record.ref} {d.case.title}</Link>
          </div>
          {d.flags.map((f, n) => (
            <div key={n} className="flag bad">“{f.text}”: {FLAG_TEXT[f.kind]}</div>
          ))}
          {d.styleFlags.map((f, n) => (
            <div key={`s${n}`} className="flag">House style: {f.detail}</div>
          ))}
          {d.awaitingAcceptance ? <div className="flag">New lead: this reply goes out only when you accept the case.</div> : null}
          <div className="letter" dir={d.language === 'he' ? 'rtl' : undefined}>{highlight(d.body, d.flags.map((f) => f.text))}</div>
          <div className="btns">
            <button className="btn primary" disabled>{d.awaitingAcceptance ? 'Accept case and send' : 'Approve and send'}</button>
            <button className="btn" disabled>Edit</button>
            <button className="btn" disabled>Discard</button>
          </div>
          <p className="why">
            {h.sendingStage === 'A'
              ? 'Stage A: approving records your decision, but nothing is sent. Sending starts in Stage B, to test addresses only.'
              : null}
          </p>
        </div>
      ))}
    </>
  );
}
