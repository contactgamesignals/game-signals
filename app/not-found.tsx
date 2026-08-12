import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>GameSignal</span>
        </Link>
        <div className="kicker" style={{ marginTop: 24 }}>404</div>
        <h1>Page not found</h1>
        <p>The page may have moved, or the link is no longer valid.</p>
        <div className="dashboard-actions" style={{ marginTop: 18 }}>
          <Link className="btn btn-primary" href="/dashboard">Open dashboard</Link>
          <Link className="btn btn-ghost" href="/">Back to website</Link>
        </div>
      </section>
    </main>
  );
}
