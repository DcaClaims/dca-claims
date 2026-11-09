import Link from 'next/link';
import { allCases, drafts, health, inbox, now, today, type TodayItem } from '../src/demo/view.ts';
import { PageHead, fmtDate } from './_components/ui';

const GROUP_LABEL: Record<TodayItem['group'], string> = {
  alert: 'Security',
  decision: 'Your decision',
  deadline: 'Deadline',
  client_waiting: 'Client waiting',
  approval: 'Approval',
  review: 'Review',
  chase: 'Chase',
};

export default function TodayPage() {
  const items = today();
  const h = health();
  const msgs = inbox();
  const openCases = allCases().filter((c) => c.record.open).length;
  const waitingApproval = drafts().length;
  const review = msgs.filter((m) => m.lead.action === 'review').length;
  const newLeads = msgs.filter((m) => m.lead.action === 'create_lead').length;

  return (
    <>
      <PageHead title="Today" sub={`${fmtDate(now())}. Most important first: security, legal deadlines, clients waiting, then approvals.`} />

      <div className="grid3" style={{ marginBottom: 20 }}>
        <div className="stat"><span className="muted small">Needs you today</span><b>{items.filter((i) => i.urgency === 'today' || i.urgency === 'overdue').length}</b></div>
        <div className="stat"><span className="muted small">Drafts awaiting approval</span><b>{waitingApproval}</b></div>
        <div className="stat"><span className="muted small">Messages to review</span><b>{review}</b></div>
      </div>

      <div className="list">
        {items.map((i, n) => (
          <Link key={n} href={i.href} className="row">
            <span className={`dot ${i.group === 'alert' ? 'overdue' : i.urgency}`} title={i.urgency} />
            <span className="grow">
              <span className="title">{i.title}</span>
              <span className="sub" style={{ display: 'block' }}>{GROUP_LABEL[i.group]} · {i.detail.replace(/(\d{4}-\d{2}-\d{2})/g, (d) => fmtDate(d))}</span>
            </span>
            {i.due ? <span className="right">{i.urgency === 'overdue' ? 'Overdue ' : 'Due '}{fmtDate(i.due)}</span> : null}
          </Link>
        ))}
      </div>

      <h2>How things are running</h2>
      <div className="grid2">
        <div className="card">
          <table className="kv">
            <tbody>
              <tr><td>Sending</td><td>Stage {h.sendingStage}: draft only</td></tr>
              <tr><td>Pause</td><td>{h.paused ? 'Paused' : 'Not paused'}</td></tr>
              <tr><td>Mailboxes</td><td>{h.mailbox}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <table className="kv">
            <tbody>
              <tr><td>Open cases</td><td>{openCases}</td></tr>
              <tr><td>New leads (filtered)</td><td>{newLeads}</td></tr>
              <tr><td>Failed automations</td><td>{h.failedAutomations}</td></tr>
              <tr><td>Last backup</td><td>{h.lastBackup}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
