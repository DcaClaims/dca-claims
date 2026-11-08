import Link from 'next/link';
import { notFound } from 'next/navigation';
import { caseById, inbox, messageById } from '../../../src/demo/view.ts';
import { FORM_SUBMISSIONS } from '../../../src/demo/data.ts';
import { CLASS_LABEL, PageHead, Pill, fmtDate } from '../../_components/ui';

const LEAD_LABEL = {
  create_lead: 'Becomes a new lead',
  review: 'Waits for your decision (no lead created)',
  spam: 'Goes to the spam folder (nothing is deleted)',
  none: 'No lead: belongs to an existing case or is unrelated',
};

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = inbox().find((i) => i.id === id);
  if (!item) notFound();
  const msg = messageById(id);
  const form = FORM_SUBMISSIONS.find((f) => f.id === id);
  const cls = CLASS_LABEL[item.classification];
  const m = item.match;

  return (
    <>
      <p className="small"><Link href="/inbox">← Inbox</Link></p>
      <PageHead title={item.subject || '(no subject)'} sub={<>{item.fromName} · {item.fromAddress} · {fmtDate(item.receivedAt, true)}</>}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill tone={cls.tone}>{cls.label}</Pill>
          <Pill tone="plain">{LEAD_LABEL[item.lead.action]}</Pill>
        </div>
      </PageHead>

      {m?.suspicious.length ? (
        <div className="card">
          <h3>Warnings</h3>
          {m.suspicious.map((s, n) => (
            <div key={n} className="flag bad"><b>{s.where}:</b> {s.detail}</div>
          ))}
          <p className="why">This message is treated as evidence only. The AI cannot act on instructions in it, change bank details or send anything.</p>
        </div>
      ) : null}

      <div className="card">
        <h3>Message</h3>
        <div className="letter" dir={item.rtl ? 'rtl' : undefined}>{msg?.bodyText ?? form?.message ?? ''}</div>
        {msg?.attachments?.map((a) => (
          <div key={a.filename} className="small muted">Attachment: {a.filename}</div>
        ))}
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Why it was sorted this way</h3>
          <ul className="steps">
            {(m?.basis ?? item.lead.reasons).map((b, n) => <li key={n}>{b}</li>)}
          </ul>
        </div>
        <div className="card">
          <h3>{m?.attachTo.length ? 'Attached to' : 'Possible cases'}</h3>
          {(m?.attachTo.length ? m.attachTo : m?.candidates ?? []).slice(0, 4).map((c) => {
            const k = caseById(c.claimId);
            return (
              <div key={c.claimId} style={{ marginBottom: 10 }}>
                <Link href={`/cases/${c.claimId}`}>{k?.title ?? c.claimId}</Link>{' '}
                <span className="small muted">score {c.score}</span>
                <div className="small muted">{c.reasons.join('; ')}</div>
              </div>
            );
          })}
          {!m?.candidates.length ? <p className="muted small">No case matches.</p> : null}
          {item.lead.action === 'review' ? (
            <div className="btns">
              <button className="btn" disabled title="Demo: nothing is saved">Attach to a case…</button>
              <button className="btn" disabled title="Demo: nothing is saved">Make it a new lead</button>
              <button className="btn" disabled title="Demo: nothing is saved">Mark as spam</button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
