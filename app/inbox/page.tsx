import Link from 'next/link';
import { caseById, inbox, type InboxItem } from '../../src/demo/view.ts';
import { CLASS_LABEL, PageHead, Pill, fmtDate } from '../_components/ui';

const TABS: { key: string; label: string; test: (i: InboxItem) => boolean }[] = [
  { key: 'review', label: 'Needs review', test: (i) => i.lead.action === 'review' },
  { key: 'case', label: 'Case mail', test: (i) => i.classification === 'case' },
  { key: 'leads', label: 'New leads', test: (i) => i.lead.action === 'create_lead' },
  { key: 'spam', label: 'Spam', test: (i) => i.lead.action === 'spam' },
  { key: 'all', label: 'All', test: () => true },
];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'review' } = await searchParams;
  const all = inbox();
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const items = all.filter(current.test);

  return (
    <>
      <PageHead title="Inbox" sub="info@ and office@ together. Uncertain messages wait here for you; they are never forced into a case." />
      <div className="tabs">
        {TABS.map((t) => (
          <Link key={t.key} href={`/inbox?tab=${t.key}`} className={t.key === current.key ? 'active' : ''}>
            {t.label} ({all.filter(t.test).length})
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="card muted">Nothing here.</div>
      ) : (
        <div className="list">
          {items.map((i) => {
            const cls = CLASS_LABEL[i.classification];
            const cases = (i.match?.attachTo ?? []).map((a) => caseById(a.claimId)?.title).filter(Boolean);
            const suspicious = (i.match?.suspicious.length ?? 0) > 0;
            return (
              <Link key={i.id} href={`/inbox/${i.id}`} className="row">
                <span className="grow">
                  <span className="title">{i.fromName}</span>{' '}
                  <span className="sub">{i.fromAddress}</span>
                  <span style={{ display: 'block' }} dir={i.rtl ? 'rtl' : undefined}>{i.subject}</span>
                  <span className="sub" style={{ display: 'block' }} dir={i.rtl ? 'rtl' : undefined}>{i.preview}</span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    <Pill tone={cls.tone}>{cls.label}</Pill>
                    {cases.map((t) => <Pill key={t} tone="plain">{t}</Pill>)}
                    {suspicious ? <Pill tone="bad">Suspicious</Pill> : null}
                  </span>
                </span>
                <span className="right">{fmtDate(i.receivedAt, true)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
