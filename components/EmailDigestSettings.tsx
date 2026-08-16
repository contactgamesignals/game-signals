"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  workspaceId: string;
  defaultEmail: string;
  canManage: boolean;
};

type EmailStatus = {
  configured: boolean;
  enabled: boolean;
  destination: string;
  minimum_signal_score: number;
  minimum_live_viewers: number;
  allowed: boolean;
  plan: string;
  provider_configured: boolean;
};

export default function EmailDigestSettings({ workspaceId, defaultEmail, canManage }: Props) {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [email, setEmail] = useState(defaultEmail);
  const [minimumSignalScore, setMinimumSignalScore] = useState(0);
  const [minimumLiveViewers, setMinimumLiveViewers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invokeEmail(action: "status" | "upsert" | "delete" | "test", extra: Record<string, unknown> = {}) {
    const supabase = createClient();
    const { data, error: functionError } = await supabase.functions.invoke("manage-email", {
      body: { action, workspace_id: workspaceId, ...extra },
    });
    if (functionError) throw new Error(functionError.message);
    if (data?.error) throw new Error(String(data.error));
    return data as Record<string, unknown>;
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await invokeEmail("status");
        if (!active) return;
        const next: EmailStatus = {
          configured: Boolean(data.configured),
          enabled: Boolean(data.enabled),
          destination: String(data.destination ?? defaultEmail),
          minimum_signal_score: Number(data.minimum_signal_score ?? 0),
          minimum_live_viewers: Number(data.minimum_live_viewers ?? 0),
          allowed: Boolean(data.allowed),
          plan: String(data.plan ?? "free"),
          provider_configured: Boolean(data.provider_configured),
        };
        setStatus(next);
        setEmail(next.destination || defaultEmail);
        setMinimumSignalScore(next.minimum_signal_score);
        setMinimumLiveViewers(next.minimum_live_viewers);
      } catch (statusError) {
        if (active) setError(statusError instanceof Error ? statusError.message : "Could not load email digest settings.");
      }
    })();

    return () => { active = false; };
    // workspaceId and defaultEmail are stable for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, defaultEmail]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !status?.allowed || !status.provider_configured) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const data = await invokeEmail("upsert", {
        email,
        minimum_signal_score: minimumSignalScore,
        minimum_live_viewers: minimumLiveViewers,
      });
      setStatus((current) => ({
        configured: true,
        enabled: true,
        destination: String(data.destination ?? email),
        minimum_signal_score: Number(data.minimum_signal_score ?? minimumSignalScore),
        minimum_live_viewers: Number(data.minimum_live_viewers ?? minimumLiveViewers),
        allowed: Boolean(data.allowed ?? current?.allowed),
        plan: String(data.plan ?? current?.plan ?? "free"),
        provider_configured: Boolean(data.provider_configured ?? current?.provider_configured),
      }));
      setMessage("Daily email digest enabled. You will receive at most one digest per day, and only when new matching signals exist.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save email digest settings.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!canManage || !status?.configured || !status.provider_configured) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await invokeEmail("test");
      setMessage("Test email sent.");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Could not send the test email.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!canManage || !status?.configured) return;
    if (!window.confirm("Turn off the daily email digest for this workspace?")) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await invokeEmail("delete");
      setStatus((current) => current ? { ...current, configured: false, enabled: false } : current);
      setMessage("Daily email digest disabled.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not disable the email digest.");
    } finally {
      setBusy(false);
    }
  }

  const providerPending = status !== null && !status.provider_configured;
  const planLocked = status !== null && !status.allowed;
  const readOnly = !canManage;
  const connected = Boolean(status?.configured && status?.enabled);
  const formLocked = busy || providerPending || planLocked || readOnly;

  return (
    <section className="settings-card">
      <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
        <div>
          <h2>Daily email digest</h2>
          <p>
            One combined summary per recipient per day. If no new matching YouTube or Twitch signals were detected, no email is sent.
          </p>
        </div>
        <span className="plan-pill">
          {!status ? "Checking…" : providerPending ? "Provider setup pending" : planLocked ? "Paid plan required" : connected ? "Enabled" : "Off"}
        </span>
      </div>

      <div className="status-message" style={{ marginBottom: 14 }}>
        Email is intentionally not instant. Discord and the dashboard remain the realtime channels. The daily digest combines all matching games for the recipient and is capped at one message per day.
      </div>

      {providerPending ? (
        <div className="status-message" style={{ marginBottom: 14 }}>
          The sending domain is being connected to the production email provider. Digest settings will unlock after the provider credentials are configured in Supabase.
        </div>
      ) : null}
      {planLocked ? (
        <div className="status-message" style={{ marginBottom: 14 }}>
          Daily email digest is available on Indie, Studio, and Publisher while the subscription is active.
        </div>
      ) : null}
      {readOnly ? (
        <div className="status-message" style={{ marginBottom: 14 }}>
          Only workspace owners and admins can change notification destinations.
        </div>
      ) : null}
      {message ? <div className="auth-success" style={{ marginBottom: 14 }}>{message}</div> : null}
      {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

      <form className="form-grid" onSubmit={save}>
        <label>
          Digest recipient
          <input
            className="app-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@studio.com"
            required
            disabled={formLocked}
          />
          <span className="form-help">If this same address is used across multiple workspaces, the worker combines eligible signals into one daily email.</span>
        </label>
        <label>
          Minimum signal score: {minimumSignalScore}
          <input
            className="range"
            type="range"
            min="0"
            max="100"
            value={minimumSignalScore}
            onChange={(event) => setMinimumSignalScore(Number(event.target.value))}
            disabled={formLocked}
          />
        </label>
        <label>
          Minimum viewers for Twitch streams
          <input
            className="app-input"
            type="number"
            min="0"
            step="1"
            value={minimumLiveViewers}
            onChange={(event) => setMinimumLiveViewers(Number(event.target.value))}
            disabled={formLocked}
          />
        </label>
        <div className="dashboard-actions">
          <button className="btn btn-primary" disabled={formLocked || !email.trim()}>
            {connected ? "Update daily digest" : "Enable daily digest"}
          </button>
          <button className="btn btn-ghost" type="button" disabled={busy || !canManage || !connected || providerPending} onClick={sendTest}>
            Send test
          </button>
          {connected ? (
            <button className="icon-btn danger" type="button" disabled={busy || !canManage} onClick={disable}>
              Disable
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
