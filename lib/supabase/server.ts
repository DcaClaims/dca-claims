import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, authConfigured } from './env';

/** The logged-in person's session, from their cookies. */
export async function sessionClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a server component: cookies are refreshed by the middleware instead.
        }
      },
    },
  });
}

/**
 * Server-only database access with the secret key. Never sent to the browser. Use only after `requireStaff()`.
 */
export function adminClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!authConfigured() || !key) throw new Error('Database is not configured');
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type Staff = { id: string; email: string; fullName: string; role: 'owner' | 'caseworker' | 'accounts' | 'readonly' };

/**
 * The current staff member, or null. Requires a login with two-step verification (aal2)
 * and a matching active row in `users`.
 */
export async function currentStaff(): Promise<Staff | null> {
  if (!authConfigured()) return null;
  const sb = await sessionClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return null;
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return null;
  const db = adminClient();
  const { data: row } = await db
    .from('users')
    .select('id, email, full_name, role, active, auth_user_id')
    .or(`auth_user_id.eq.${u.user.id},email.eq.${(u.user.email ?? '').toLowerCase()}`)
    .eq('active', true)
    .maybeSingle();
  if (!row) return null;
  if (!row.auth_user_id) await db.from('users').update({ auth_user_id: u.user.id }).eq('id', row.id);
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
}
