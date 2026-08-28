"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function trialDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function TrialCodeCard({ trialEndsAt }: { trialEndsAt?: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (trialEndsAt) {
    return (
      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Creator trial</h2>
            <p>Your 7-day trial is active until {trialDate(trialEndsAt)}.</p>
          </div>
          <span className="plan-pill">Trial active</span>
        </div>
        <div className="status-message" style={{ marginBottom: 0 }}>
          Includes 1 active game, YouTube + Twitch monitoring, Discord alerts, daily email digest and CSV export. No card is attached to the trial and it does not renew automatically.
        </div>
      </section>
    );
  }

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return;

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/trial/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizedCode }),
      });
      const result = (await response.json()) as { error?: string; trialEndsAt?: string };
      if (!response.ok || !result.trialEndsAt) {
        throw new Error(result.error ?? "Could not activate the trial code.");
      }

      setMessage(`Trial activated until ${trialDate(result.trialEndsAt)}.`);
      setCode("");
      router.refresh();
    } catch (redeemError) {
      setError(redeemError instanceof Error ? redeemError.message : "Could not activate the trial code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card">
      <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
        <div>
          <h2>Have a creator trial code?</h2>
          <p>Redeem a code from a creator or campaign to unlock 7 days of full monitoring for one active game.</p>
        </div>
        <span className="plan-pill">No card required</span>
      </div>

      {message ? <div className="auth-success" style={{ marginBottom: 14 }}>{message}</div> : null}
      {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

      <form className="form-grid" onSubmit={redeem}>
        <label>
          Trial code
          <input
            className="app-input"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="e.g. NOVA7"
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          <span className="form-help">One promotional trial can be redeemed per account/workspace. The trial ends automatically after 7 days and never starts a paid subscription.</span>
        </label>
        <div className="dashboard-actions">
          <button className="btn btn-primary" disabled={busy || !code.trim()}>
            {busy ? "Activating..." : "Start 7-day trial"}
          </button>
        </div>
      </form>
    </section>
  );
}
