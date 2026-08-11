"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  workspaceId: string;
};

type DiscordStatus = {
  configured: boolean;
  enabled: boolean;
  minimum_signal_score: number;
  minimum_live_viewers: number;
  allowed: boolean;
  plan: string;
};

export default function SettingsClient({ workspaceId }: Props) {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [minimumSignalScore, setMinimumSignalScore] = useState(0);
  const [minimumLiveViewers, setMinimumLiveViewers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invoke(action: "status" | "upsert" | "delete" | "test", extra: Record<string, unknown> = {}) {
    const supabase = createClient();
    const { data, error: functionError } = await supabase.functions.invoke("manage-discord", {
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
        const data = await invoke("status");
        if (!active) return;
        const nextStatus: DiscordStatus = {
          configured: Boolean(data.configured),
          enabled: Boolean(data.enabled),
          minimum_signal_score: Number(data.minimum_signal_score ?? 0),
          minimum_live_viewers: Number(data.minimum_live_viewers ?? 0),
          allowed: Boolean(data.allowed),
          plan: String(data.plan ?? "free"),
        };
        setStatus(nextStatus);
        setMinimumSignalScore(nextStatus.minimum_signal_score);
        setMinimumLiveViewers(nextStatus.minimum_live_viewers);
      } catch (statusError) {
        if (active) setError(statusError instanceof Error ? statusError.message : "Could not load Discord settings.");
      }
    })();
    return () => { active = false; };
    // workspaceId is stable for the lifetime of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function saveDiscord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status?.allowed) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await invoke("upsert", {
        webhook_url: webhookUrl,
        minimum_signal_score: minimumSignalScore,
        minimum_live_viewers: minimumLiveViewers,
      });
      setStatus((current) => ({
        configured: true,
        enabled: true,
        minimum_signal_score: Number(data.minimum_signal_score ?? minimumSignalScore),
        minimum_live_viewers: Number(data.minimum_live_viewers ?? minimumLiveViewers),
        allowed: Boolean(data.allowed ?? current?.allowed),
        plan: String(data.plan ?? current?.plan ?? "free"),
      }));
      setWebhookUrl("");
      setMessage("Discord webhook saved securely.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the webhook.");
    } finally {
      setBusy(false);
    }
  }

  async function testDiscord() {
    if (!status?.allowed) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await invoke("test");
      setMessage("Test notification sent to Discord.");
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Could not send the test notification.");
    } finally {
      setBusy(false);
    }
  }

  async function removeDiscord() {
    if (!window.confirm("Remove the Discord webhook from this workspace?")) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await invoke("delete");
      setStatus((current) => ({
        configured: false,
        enabled: false,
        minimum_signal_score: 0,
        minimum_live_viewers: 0,
        allowed: current?.allowed ?? false,
        plan: current?.plan ?? "free",
      }));
      setMinimumSignalScore(0);
      setMinimumLiveViewers(0);
      setWebhookUrl("");
      setMessage("Discord webhook removed.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove the webhook.");
    } finally {
      setBusy(false);
    }
  }

  const discordLocked = status !== null && !status.allowed;

  return (
    <div className="settings-grid">
      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Discord alerts</h2>
            <p>The webhook URL is stored server-side and is never returned to the browser after saving.</p>
          </div>
          <span className="plan-pill">
            {!status ? "Checking…" : !status.allowed ? "Studio+ required" : status.configured ? "Connected" : "Not connected"}
          </span>
        </div>

        {discordLocked ? (
          <div className="status-message" style={{ marginBottom: 14 }}>
            Discord alerts are included in Studio and Publisher. Your current plan is <strong>{status.plan}</strong>.
            Existing webhook data can still be removed after a downgrade, but alerts will not be delivered.
          </div>
        ) : null}
        {message ? <div className="auth-success" style={{ marginBottom: 14 }}>{message}</div> : null}
        {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

        <form className="form-grid" onSubmit={saveDiscord}>
          <label>
            {status?.configured ? "Replace webhook URL" : "Discord webhook URL"}
            <input
              className="app-input"
              type="url"
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              required
              autoComplete="off"
              disabled={busy || discordLocked}
            />
            <span className="form-help">Create it in Discord: Server Settings → Integrations → Webhooks.</span>
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
              disabled={busy || discordLocked}
            />
          </label>
          <label>
            Minimum viewers for live streams
            <input
              className="app-input"
              type="number"
              min="0"
              step="1"
              value={minimumLiveViewers}
              onChange={(event) => setMinimumLiveViewers(Number(event.target.value))}
              disabled={busy || discordLocked}
            />
          </label>
          <div className="dashboard-actions">
            <button className="btn btn-primary" disabled={busy || discordLocked || !webhookUrl.trim()}>
              {status?.configured ? "Replace webhook" : "Connect Discord"}
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy || discordLocked || !status?.configured} onClick={testDiscord}>
              Send test
            </button>
            {status?.configured ? (
              <button className="icon-btn danger" type="button" disabled={busy} onClick={removeDiscord}>
                Remove
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="settings-card">
        <h2>Email alerts</h2>
        <p>Notification rules are prepared in the database. Transactional email delivery will be enabled after a sending provider and verified domain are configured.</p>
        <div className="settings-row"><span>Status</span><span className="plan-pill">Provider required</span></div>
      </section>

      <section className="settings-card">
        <h2>Billing</h2>
        <p>Stripe Checkout and Billing Portal are the next payment stage after real platform monitoring is verified.</p>
        <div className="settings-row"><span>Status</span><span className="plan-pill">Not connected</span></div>
      </section>

      <section className="settings-card">
        <h2>Platform monitoring</h2>
        <p>Twitch and YouTube workers are deployed. Their production API credentials still need to be added before real scans can run.</p>
        <div className="settings-row"><span>Workers</span><span className="plan-pill">Deployed</span></div>
      </section>
    </div>
  );
}
