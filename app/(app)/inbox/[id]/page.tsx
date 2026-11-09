import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getView } from '@/lib/data/view';
import { attachMessage, setMessageOverride } from '@/lib/data/actions';
import { CLASS_LABEL, PageHead, Pill, fmtDate } from '@/app/_components/ui';

const LEAD_LABEL = {
  create_lead: 'Becomes a new lead',
  review: 'Waits for your decision (no lead created)',
  spam: 'Goes to the spam folder (nothing is deleted)',
  none: 'No lead: belongs to an existing case or is unrelated',
};

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { allCases, caseById, inbox, messageById, formById, mode } = await getView();
  const live = mode === 'live';
  const item = inbox().find((i) => i.id === id);
  if (!item) notFound();
  const msg = messageById(id);
  const form = formById(id);
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
          {item.kind === 'email' ? (
            <>
              <form action={attachMessage} className="btns" style={{ alignItems: 'center' }}>
                <input type="hidden" name="messageId" value={item.id} />
                <select name="claimId" className="select" defaultValue={m?.candidates[0]?.claimId ?? ''} disabled={!live}>
                  <option value="">Attach to case…</option>
                  {allCases().filter((k) => !k.isLead).map((k) => <option key={k.record.claimId} value={k.record.claimId}>#{k.record.ref} {k.title}</option>)}
                </select>
                <button className="btn" disabled={!live}>Attach</button>
              </form>
              <form action={setMessageOverride} className="btns">
                <input type="hidden" name="messageId" value={item.id} />
                <button className="btn" name="override" value="lead" disabled={!live}>Make it a new lead</button>
                <button className="btn" name="override" value="unrelated" disabled={!live}>Not about a claim</button>
                <button className="btn" name="override" value="spam" disabled={!live}>Spam</button>
              </form>
              {!live ? <p className="why">Demo: these buttons work once the database is connected.</p> : null}
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
