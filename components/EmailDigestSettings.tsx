"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  workspaceId: string;
};

type EmailStatus = {
  configured: boolean;
  enabled: boolean;
  destination: string;
  minimum_signal_score: number;
  minimum_live_viewers: number;
  allowed: boolean;
  can_manage: boolean;
  plan: string;
  provider_configured: boolean;
};

export default function EmailDigestSettings({ workspaceId }: Props) {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [destination, setDestination] = useState("");
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
        const nextStatus: EmailStatus = {
          configured: Boolean(data.configured),
          enabled: Boolean(data.enabled),
          destination: String(data.destination ?? ""),
          minimum_signal_score: Number(data.minimum_signal_score ?? 0),
          minimum_live_viewers: Number(data.minimum_live_viewers ?? 0),
          allowed: Boolean(data.allowed),
          can_manage: Boolean(data.can_manage),
          plan: String(data.plan ?? "free"),
          provider_configured: Boolean(data.provider_configured),
        };
        setStatus(nextStatus);
        setDestination(nextStatus.destination);
        setMinimumLiveViewers(nextStatus.minimum_live_viewers);
      } catch (statusError) {
        if (active) setError(statusError instanceof Error ? statusError.message : "Could not load email settings.");
      }
    })();

    return () => { active = false; };
    // workspaceId is stable for the lifetime of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function saveDigest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status?.can_manage || !status.allowed || !status.provider_configured) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await invokeEmail("upsert", {
        email: destination,
        minimum_signal_score: 0,
        minimum_live_viewers: minimumLiveViewers,
      });
      setStatus((current) => ({
        configured: true,
        enabled: true,
        destination: String(data.destination ?? destination),
        minimum_signal_score: 0,
        minimum_live_viewers: Number(data.minimum_live_viewers ?? minimumLiveViewers),
        allowed: Boolean(data.allowed ?? current?.allowed),
        can_manage: Boolean(data.can_manage ?? current?.can_manage ?? true),
        plan: String(data.plan ?? current?.plan ?? "free"),
        provider_configured: Boolean(data.provider_configured ?? current?.provider_configured),
      }));
      setDestination(String(data.destination ?? destination));
      setMessage("Daily email digest enabled.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save email settings.");
    } finally {
      setBusy(false);
    }
  }

  async function testDigest() {
    if (!status?.can_manage || !status.configured || !status.enabled || !status.provider_configured) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await invokeEmail("test");
      setMessage("Test email sent.");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Could not send the test email.");
    } finally {
      setBusy(false);
    }
  }

  async function disableDigest() {
    if (!status?.can_manage) return;
    if (!window.confirm("Turn off the daily email digest for this workspace?")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await invokeEmail("delete");
      setStatus((current) => current ? { ...current, configured: false, enabled: false } : current);
      setMessage("Daily email digest disabled.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not disable the daily digest.");
    } finally {
      setBusy(false);
    }
  }

  const providerReady = Boolean(status?.provider_configured);
  const canManage = Boolean(status?.can_manage);
  const locked = !status || !canManage || !status.allowed || !providerReady;
  const connected = Boolean(status?.configured && status?.enabled && providerReady);

  return (
    <section className="settings-card">
      <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
        <div>
          <h2><span className="service-mark mail" aria-hidden="true" />Daily email digest</h2>
          <p>
            Receive one combined email per day only when new matching YouTube or Twitch signals were found. No new signals means no email.
          </p>
        </div>
        <span className="plan-pill">
          {!status ? "Checking…" : !providerReady ? "Unavailable" : !status.allowed ? "Paid plan required" : connected ? "On" : "Off"}
        </span>
      </div>

      {status && !status.allowed ? (
        <div className="status-message" style={{ marginBottom: 14 }}>
          Daily email digests are available with active paid monitoring or a promotional trial.
        </div>
      ) : null}
      {status && !status.can_manage ? (
        <div className="status-message" style={{ marginBottom: 14 }}>
          Only workspace owners and admins can manage the daily email digest. The saved destination is hidden.
        </div>
      ) : null}
      {status && !providerReady ? (
        <div className="status-message" style={{ marginBottom: 14 }}>
          Email delivery is temporarily unavailable. Please try again later.
        </div>
      ) : null}
      <div className="status-message" style={{ marginBottom: 14 }}>
        Maximum one digest per recipient per day. If the same address is used for several games or workspaces, matching signals are combined into a single email.
      </div>
      {message ? <div className="auth-success" style={{ marginBottom: 14 }}>{message}</div> : null}
      {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

      <form className="form-grid" onSubmit={saveDigest}>
        <label>
          Email address
          <input
            className="app-input"
            type="email"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder={canManage ? "you@studio.com" : "Hidden for workspace members"}
            required
            autoComplete="email"
            disabled={busy || locked}
          />
        </label>
        <label>
          Minimum viewers for Twitch live streams
          <input
            className="app-input"
            type="number"
            min="0"
            step="1"
            value={minimumLiveViewers}
            onChange={(event) => setMinimumLiveViewers(Number(event.target.value))}
            disabled={busy || locked}
          />
        </label>
        <div className="dashboard-actions">
          <button className="btn btn-primary" disabled={busy || locked || !destination.trim()}>
            <span className="service-mark mail" aria-hidden="true" />
            {connected ? "Update daily digest" : "Enable daily digest"}
          </button>
          <button className="btn btn-ghost" type="button" disabled={busy || !connected || !canManage} onClick={testDigest}>
            <span className="service-mark mail" aria-hidden="true" />Send test
          </button>
          {connected ? (
            <button className="icon-btn danger" type="button" disabled={busy || !canManage} onClick={disableDigest}>
              Turn off
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
