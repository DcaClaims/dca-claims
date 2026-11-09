import type { ReactNode } from 'react';
import { MobileNav, SideNav, type NavItem } from '@/app/_components/Nav';
import { SignOut } from '@/app/_components/SignOut';
import { drafts, health, inbox } from '@/src/demo/view.ts';
import { authConfigured } from '@/lib/supabase/env';
import { currentStaff } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const live = authConfigured();
  const staff = live ? await currentStaff() : null;

  if (live && !staff) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card">
          <h1>No access yet</h1>
          <p className="muted">You're logged in, but this account isn't set up as DCA staff. Ask the owner to add you.</p>
          <SignOut />
        </div>
      </div>
    );
  }

  const review = inbox().filter((i) => i.lead.action === 'review').length;
  const approvals = drafts().length;
  const h = health();
  const items: NavItem[] = [
    { href: '/', label: 'Today' },
    { href: '/inbox', label: 'Inbox', count: review },
    { href: '/approvals', label: 'Approvals', count: approvals },
    { href: '/cases', label: 'Cases' },
  ];
  return (
    <>
      <MobileNav items={items} />
      <div className="shell">
        <aside className="side">
          <div className="brand">
            DCA Claims<span>Case management</span>
          </div>
          <SideNav items={items} />
          {staff ? (
            <div className="side-foot">
              <div className="small">{staff.fullName}</div>
              <div className="small muted">{staff.role}</div>
              <SignOut />
            </div>
          ) : null}
        </aside>
        <main className="main">
          <div className="banner">
            <span className="pill stage">Stage {h.sendingStage}: draft only, nothing is sent</span>
            <span className="pill demo">Demo data: all names and bookings are invented</span>
            {h.paused ? <span className="pill bad">Paused</span> : null}
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
