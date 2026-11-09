'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { browserClient } from '@/lib/supabase/browser';

/** Every login: the 6-digit code from Authy. */
export default function MfaVerifyPage() {
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await browserClient().auth.mfa.listFactors();
      const f = data?.totp.find((x) => x.status === 'verified');
      if (f) setFactorId(f.id);
      else window.location.href = '/mfa/setup';
    })();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await browserClient().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setError('That code did not match. Use the newest code in Authy and try again.');
      return;
    }
    window.location.href = '/';
  }

  return (
    <form onSubmit={submit}>
      <h1>Authy code</h1>
      <p className="muted">Open Authy and type the 6-digit code for DCA Claims.</p>
      <label className="field">
        <span>6-digit code</span>
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      {error ? <div className="flag bad">{error}</div> : null}
      <button className="btn primary wide" disabled={busy || !factorId}>{busy ? 'Checking…' : 'Log in'}</button>
      <p className="why">
        Lost your phone? <a href="/login" onClick={async () => { await browserClient().auth.signOut(); }}>Sign out</a> and contact the owner.
      </p>
    </form>
  );
}
