'use client';

import { useState, type FormEvent } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { authConfigured } from '@/lib/supabase/env';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!authConfigured()) {
    return <p className="muted">Demo mode: there is no login. <a href="/">Open the demo</a>.</p>;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await browserClient().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError('Email or password not recognised.');
      return;
    }
    // The next step (Authy code, or setting Authy up) is decided by the server.
    window.location.href = '/';
  }

  return (
    <form onSubmit={submit}>
      <h1>Log in</h1>
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error ? <div className="flag bad">{error}</div> : null}
      <button className="btn primary wide" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
      <p className="why">After your password you'll be asked for the 6-digit code from Authy.</p>
    </form>
  );
}
