'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { browserClient } from '@/lib/supabase/browser';

/** First login: add DCA Claims to Authy by scanning a QR code, then confirm with a code. */
export default function MfaSetupPage() {
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = browserClient();
      // Remove any half-finished setup from an earlier attempt, so a fresh QR code is shown.
      const { data: list } = await sb.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `DCA Claims ${Date.now()}` });
      if (error || !data) {
        setError('Could not start the Authy setup. Refresh the page to try again.');
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
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
      <h1>Set up Authy</h1>
      <ol className="steps">
        <li>Open Authy and tap <b>+</b> (Add account).</li>
        <li>Scan this code.</li>
        <li>Type the 6-digit code Authy shows for DCA Claims.</li>
      </ol>
      {qr ? <img src={qr} alt="QR code for Authy" width={200} height={200} style={{ display: 'block', margin: '12px auto', background: '#fff', padding: 8, borderRadius: 8 }} /> : <p className="muted">Preparing…</p>}
      {secret ? <p className="small muted" style={{ overflowWrap: 'anywhere' }}>Can't scan? Enter this key in Authy instead: {secret}</p> : null}
      <label className="field">
        <span>6-digit code</span>
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      {error ? <div className="flag bad">{error}</div> : null}
      <button className="btn primary wide" disabled={busy || !factorId}>{busy ? 'Checking…' : 'Confirm'}</button>
    </form>
  );
}
