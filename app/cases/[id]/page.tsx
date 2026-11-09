import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SUGGESTION_LABEL, acceptanceFor, assessmentFor, caseById, drafts, headline, labelDeadline, messagesForCase } from '../../../src/demo/view.ts';
import { OUTCOME_LABEL, PageHead, Pill, fmtDate, money } from '../../_components/ui';

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = caseById(id);
  if (!c) notFound();
  const a = assessmentFor(c);
  const h = headline(c);
  const messages = messagesForCase(c);
  const advice = c.isLead ? acceptanceFor(c) : null;
  const caseDrafts = drafts().filter((d) => d.claimId === id);
  const sectors = c.assessment.sectors;

  return (
    <>
      <p className="small"><Link href="/cases">← Cases</Link></p>
      <PageHead title={`#${c.record.ref} ${c.title}`} sub={<>{c.status} · client {c.clientName} ({c.language === 'he' ? 'Hebrew' : c.language === 'fr' ? 'French' : 'English'})</>}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill tone="info">Next: {c.nextAction} · {fmtDate(c.nextActionDue)}</Pill>
          {c.regimePursued ? <Pill tone="plain">Pursuing {c.regimePursued}</Pill> : null}
        </div>
      </PageHead>

      {advice ? (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <h3>Your decision: take this case?</h3>
          <p>
            Suggested: <Pill tone={advice.suggestion === 'accept' ? 'ok' : advice.suggestion === 'decline' ? 'bad' : 'warn'}>{SUGGESTION_LABEL[advice.suggestion]}</Pill>
          </p>
          <ul className="steps">{advice.reasons.map((r, n) => <li key={n}>{r}</li>)}</ul>
          <div className="btns">
            <button className="btn primary" disabled title="Demo: nothing is saved or sent">Accept and send first reply</button>
            <button className="btn" disabled title="Demo: nothing is saved or sent">Decline (polite reply)</button>
            <button className="btn" disabled title="Demo: nothing is saved or sent">Ask for details</button>
          </div>
          <p className="why">Nothing goes to a new client until you decide. The first reply is ready under Drafts.</p>
        </div>
      ) : null}

      <div className="grid2">
        <div className="card">
          <h3>Booking</h3>
          <table className="kv">
            <tbody>
              <tr><td>Booking reference</td><td>{c.record.pnr ?? 'not established'}</td></tr>
              <tr><td>One reservation</td><td>{c.assessment.singleReservation === null ? 'not established' : c.assessment.singleReservation ? 'Yes' : 'No'}</td></tr>
              {c.record.airlineCaseRef ? <tr><td>Airline reference</td><td>{c.record.airlineCaseRef}</td></tr> : null}
              {c.record.authorityCaseRef ? <tr><td>Authority reference</td><td>{c.record.authorityCaseRef}</td></tr> : null}
              <tr><td>Passengers</td><td>{c.passengers.map((p) => p.name + (p.isInfant ? ' (infant)' : '')).join(', ')}</td></tr>
              <tr><td>T&amp;Cs and fee</td><td>{c.terms.acceptedOn ? <>Accepted {fmtDate(c.terms.acceptedOn)} ({c.terms.fee})</> : <span style={{ color: 'var(--warn)' }}>Not accepted yet</span>}</td></tr>
              {c.uploadLink ? <tr><td>Upload link</td><td className="small">{c.uploadLink}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Flights</h3>
          <table className="kv">
            <tbody>
              {sectors.map((s, n) => (
                <tr key={n}>
                  <td>{s.flightNo}{n === c.assessment.disruption.sectorIndex ? ' (disrupted)' : ''}</td>
                  <td>{s.dep} → {s.arr}{s.schedDep ? `, ${fmtDate(s.schedDep, true)}` : ''}</td>
                </tr>
              ))}
              <tr><td>Disruption</td><td>{c.assessment.disruption.kind.replace('_', ' ')}</td></tr>
              <tr><td>Arrived</td><td>{c.assessment.disruption.finalArrival ? `${fmtDate(c.assessment.disruption.finalArrival, true)} (${c.assessment.disruption.finalArrivalSource ?? 'source not recorded'})` : 'not established'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <h2>Assessment</h2>
      <div className="card">
        <p>
          <b>{h.result.regime}:</b> {money(h.perPassenger, h.result.currency)} per passenger
          {h.total !== null && h.paying > 1 ? <> × {h.paying} = <b>{money(h.total, h.result.currency)}</b></> : null}
          {c.passengers.some((p) => p.isInfant) ? <span className="muted"> (infant not counted until the fare is checked)</span> : null}
        </p>
        {h.alternatives.length ? (
          <p className="small muted">
            Also possible: {h.alternatives.map((r) => `${r.regime} ${money(r.amount, r.currency)} per passenger`).join(', ')}. Only one can be claimed.
          </p>
        ) : null}
        {h.flags.map((f, n) => <div key={n} className="flag">{f}</div>)}
        {c.notes ? <div className="flag">{c.notes}</div> : null}
      </div>
      {a.results.map((r, n) => {
        const o = OUTCOME_LABEL[r.outcome];
        return (
          <details key={n} className="card" open={r.regime === h.result.regime && r.view === h.result.view}>
            <summary style={{ cursor: 'pointer' }}>
              <b>{r.regime}</b>{a.results.some((x) => x.view === 'sector') && a.results.some((x) => x.view === 'journey') ? (r.view === 'journey' ? ' · whole journey' : ' · disrupted flight only') : ''} · <Pill tone={o.tone}>{o.label}</Pill>
              {r.amount !== null ? <> · {money(r.amount, r.currency)}</> : null}
              {r.reduction50Possible ? <> · <Pill tone="warn">50% reduction possible</Pill></> : null}
            </summary>
            <ol className="steps">{r.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
            {r.missing.length ? <div className="flag">Missing: {r.missing.join('; ')}</div> : null}
            {r.flags.map((f, k) => <div key={k} className="flag">{f}</div>)}
            <table className="kv" style={{ marginTop: 8 }}>
              <tbody>{r.facts.map((f, k) => <tr key={k}><td>{f.label}</td><td>{f.value} <span className="muted small">({f.source})</span></td></tr>)}</tbody>
            </table>
            <p className="why">Rules {r.regime} v{r.ruleVersion} ({r.ruleStatus === 'draft' ? 'draft, not yet approved by you' : 'approved'}).</p>
          </details>
        );
      })}

      <h2>Deadlines</h2>
      <div className="list">
        {c.deadlines.map((d, n) => (
          <div key={n} className="row">
            <span className="grow"><span className="title">{labelDeadline(d.kind)}</span><span className="sub" style={{ display: 'block' }}>{d.basis}</span></span>
            <span className="right">{fmtDate(d.due)}</span>
          </div>
        ))}
      </div>

      <h2>Messages</h2>
      {messages.length ? (
        <div className="list">
          {messages.map((m) => (
            <Link key={m.id} href={`/inbox/${m.id}`} className="row">
              <span className="grow">
                <span className="title">{m.fromName}</span>
                <span className="sub" style={{ display: 'block' }} dir={m.rtl ? 'rtl' : undefined}>{m.subject}: {m.preview}</span>
              </span>
              <span className="right">{fmtDate(m.receivedAt, true)}</span>
            </Link>
          ))}
        </div>
      ) : <div className="card muted small">No messages in the demo for this case.</div>}

      {caseDrafts.length ? (
        <>
          <h2>Drafts</h2>
          <div className="list">
            {caseDrafts.map((d) => (
              <Link key={d.id} href={`/approvals#${d.id}`} className="row">
                <span className="grow"><span className="title">{d.subject}</span><span className="sub" style={{ display: 'block' }}>to {d.to}</span></span>
                <span className="right">{d.state === 'stale' ? 'outdated' : d.state === 'needs_checking' ? 'to check' : 'ready'}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      <h2>Documents</h2>
      <div className="list">
        {c.documents.map((d) => (
          <div key={d.name} className="row">
            <span className="grow"><span className="title">{d.name}</span><span className="sub" style={{ display: 'block' }}>{d.kind.replace('_', ' ')}</span></span>
            <span className="right">{fmtDate(d.received)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
