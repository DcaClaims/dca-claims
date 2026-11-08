'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; count?: number };

function isActive(path: string, href: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
}

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname() ?? '/';
  return (
    <nav className="nav">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={isActive(path, i.href) ? 'active' : ''}>
          <span>{i.label}</span>
          {i.count ? <span className="count">{i.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav({ items }: { items: NavItem[] }) {
  const path = usePathname() ?? '/';
  return (
    <nav className="mobile-nav">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={isActive(path, i.href) ? 'active' : ''}>
          {i.label}
          {i.count ? ` (${i.count})` : ''}
        </Link>
      ))}
    </nav>
  );
}
