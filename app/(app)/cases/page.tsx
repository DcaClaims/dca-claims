import Link from 'next/link';
import { allCases, headline } from '@/src/demo/view.ts';
import { OUTCOME_LABEL, PageHead, Pill, fmtDate, money } from '@/app/_components/ui';

export default function CasesPage() {
  const cases = allCases();
  return (
    <>
      <PageHead title="Cases" sub={`${cases.length} open cases`} />
      <div className="list">
        {cases.map((c) => {
          const h = headline(c);
          const o = OUTCOME_LABEL[h.result.outcome];
          return (
            <Link key={c.record.claimId} href={`/cases/${c.record.claimId}`} className="row">
              <span className="grow">
                <span className="title">#{c.record.ref} {c.title}</span>
                <span className="sub" style={{ display: 'block' }}>
                  {c.status} · {c.passengers.length} passenger{c.passengers.length > 1 ? 's' : ''} · next: {c.nextAction}
                </span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  <Pill tone={o.tone}>{h.result.regime}: {o.label}</Pill>
                  {h.total !== null ? <Pill tone="plain">{money(h.total, h.result.currency)} total</Pill> : null}
                  {h.needsReview ? <Pill tone="warn">Check assessment</Pill> : null}
                </span>
              </span>
              <span className="right">due {fmtDate(c.nextActionDue)}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
