// Every page needs a login AND two-step verification (Authy), except the login pages themselves.
// In demo mode (database not configured) the app is open, showing invented data only.
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, authConfigured } from './lib/supabase/env';

const PUBLIC = ['/login', '/mfa'];

export async function middleware(req: NextRequest) {
  if (!authConfigured()) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const sb = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });

  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + '/'));
  const { data } = await sb.auth.getUser();

  const go = (to: string) => {
    const url = req.nextUrl.clone();
    url.pathname = to;
    url.search = '';
    const r = NextResponse.redirect(url);
    for (const c of res.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  if (!data.user) return isPublic && path === '/login' ? res : go('/login');

  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') {
    const need = aal?.nextLevel === 'aal2' ? '/mfa/verify' : '/mfa/setup';
    return path === need ? res : go(need);
  }
  if (isPublic) return go('/');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
