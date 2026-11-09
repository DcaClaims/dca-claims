import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand" style={{ padding: '0 0 16px' }}>
          DCA Claims<span>Case management</span>
        </div>
        {children}
      </div>
    </div>
  );
}
