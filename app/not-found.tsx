import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card">
      <h1>Not found</h1>
      <p className="muted">That page or record doesn't exist.</p>
      <Link href="/">Back to Today</Link>
    </div>
  );
}
