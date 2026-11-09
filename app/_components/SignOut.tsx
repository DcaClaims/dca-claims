'use client';

import { browserClient } from '@/lib/supabase/browser';

export function SignOut() {
  return (
    <button
      className="btn"
      style={{ marginTop: 8 }}
      onClick={async () => {
        await browserClient().auth.signOut();
        window.location.href = '/login';
      }}
    >
      Sign out
    </button>
  );
}
