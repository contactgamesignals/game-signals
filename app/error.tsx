"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>GameSignal</span>
        </Link>
        <div className="kicker" style={{ marginTop: 24 }}>Something went wrong</div>
        <h1>We could not load this page</h1>
        <p>Try again. If the problem continues, contact GameSignal support.</p>
        <div className="dashboard-actions" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" onClick={reset}>Try again</button>
          <Link className="btn btn-ghost" href="/dashboard">Dashboard</Link>
        </div>
        <div className="auth-links">
          <a href="mailto:contact.gamesignals@gmail.com">contact.gamesignals@gmail.com</a>
        </div>
      </section>
    </main>
  );
}
