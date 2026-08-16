"use client";

import Link from "next/link";
import { useEffect } from "react";
import { BRAND } from "@/lib/brand";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{BRAND.name}</span>
        </Link>
        <div className="kicker" style={{ marginTop: 24 }}>Something went wrong</div>
        <h1>We could not load this page</h1>
        <p>Try again. If the problem continues, contact {BRAND.name} support.</p>
        <div className="dashboard-actions" style={{ marginTop: 18 }}>
          <button className="btn btn-primary" onClick={reset}>Try again</button>
          <Link className="btn btn-ghost" href="/dashboard">Dashboard</Link>
        </div>
        <div className="auth-links">
          <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>
        </div>
      </section>
    </main>
  );
}
