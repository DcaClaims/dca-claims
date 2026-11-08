import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { MobileNav, SideNav, type NavItem } from './_components/Nav';
import { drafts, health, inbox } from '../src/demo/view.ts';

export const metadata: Metadata = {
  title: 'DCA Claims',
  description: 'Case management for DCA Claims',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
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
    <html lang="en">
      <body>
        <MobileNav items={items} />
        <div className="shell">
          <aside className="side">
            <div className="brand">
              DCA Claims<span>Case management</span>
            </div>
            <SideNav items={items} />
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
      </body>
    </html>
  );
}
