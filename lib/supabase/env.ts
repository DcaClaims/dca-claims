// When these are not set (e.g. on GitHub's screenshot run), the app runs in demo mode: no login, invented data.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const authConfigured = () => SUPABASE_URL !== '' && SUPABASE_PUBLISHABLE_KEY !== '';
