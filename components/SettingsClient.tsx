"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BillingPeriod, PaidPlanName, PlanName } from "@/lib/plans";
import { PLAN_LABELS } from "@/lib/plans";

type Props = {
  workspaceId: string;
  currentPlan: PlanName;
  subscriptionStatus: string;
  billingConfigured: boolean;
  hasStripeCustomer: boolean;
};

type DiscordStatus = {
  configured: boolean;
  enabled: boolean;
  minimum_signal_score: number;
  minimum_live_viewers: number;
  allowed: boolean;
  plan: string;
};

type BillingResponse = {
  url?: string;
  error?: string;
  usePortal?: boolean;
};

const PAID_PLANS: Array<{
  plan: PaidPlanName;
  monthly: string;
  yearly: string;
  summary: string;
}> = [
  { plan: "indie", monthly: "24.50 PLN / mo", yearly: "245 PLN / yr", summary: "1 tracked game" },
  { plan: "studio", monthly: "64.50 PLN / mo", yearly: "645 PLN / yr", summary: "Up to 3 games + Discord" },
  { plan: "publisher", monthly: "149.50 PLN / mo", yearly: "1495 PLN / yr", summary: "Up to 10 games + export" },
];

export default function SettingsClient({
  workspaceId,
  currentPlan,
  subscriptionStatus,
  billingConfigured,
  hasStripeCustomer,
}: Props) {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [minimumSignalScore, setMinimumSignalScore] = useState(0);
  const [minimumLiveViewers, setMinimumLiveViewers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  const effectivePlan =
    subscriptionStatus === "active" || subscriptionStatus === "trialing" ? currentPlan : "free";
  const hasPaidPlan = effectivePlan !== "free";

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

    const billingResult = new URLSearchParams(window.location.search).get("billing");
    if (billingResult === "success") {
      setBillingMessage("Checkout completed. Stripe is synchronizing your subscription now.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (billingResult === "cancelled") {
      setBillingMessage("Checkout was cancelled. No changes were made.");
      window.history.replaceState({}, "", window.location.pathname);
    }

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

  async function openBillingPortal() {
    setBillingBusy(true);
    setBillingError(null);
    setBillingMessage(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await response.json()) as BillingResponse;
      if (!response.ok || !data.url) throw new Error(data.error ?? "Could not open billing portal.");
      window.location.assign(data.url);
    } catch (portalError) {
      setBillingError(portalError instanceof Error ? portalError.message : "Could not open billing portal.");
      setBillingBusy(false);
    }
  }

  async function startCheckout(plan: PaidPlanName) {
    if (!billingConfigured || hasPaidPlan) return;
    setBillingBusy(true);
    setBillingError(null);
    setBillingMessage(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, period: billingPeriod }),
      });
      const data = (await response.json()) as BillingResponse;
      if (data.usePortal) {
        setBillingBusy(false);
        await openBillingPortal();
        return;
      }
      if (!response.ok || !data.url) throw new Error(data.error ?? "Could not create Checkout session.");
      window.location.assign(data.url);
    } catch (checkoutError) {
      setBillingError(checkoutError instanceof Error ? checkoutError.message : "Could not create Checkout session.");
      setBillingBusy(false);
    }
  }

  const discordLocked = status !== null && !status.allowed;

  return (
    <div className="settings-grid">
      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Billing</h2>
            <p>Stripe-hosted Checkout for new subscriptions and Stripe Customer Portal for plan changes or cancellation.</p>
          </div>
          <span className="plan-pill">
            {PLAN_LABELS[effectivePlan]} · {subscriptionStatus}
          </span>
        </div>

        {!billingConfigured ? (
          <div className="status-message" style={{ marginBottom: 14 }}>
            Billing code is deployed, but server secrets still need to be added before Checkout can be enabled.
          </div>
        ) : null}
        {billingMessage ? <div className="auth-success" style={{ marginBottom: 14 }}>{billingMessage}</div> : null}
        {billingError ? <div className="auth-error" style={{ marginBottom: 14 }}>{billingError}</div> : null}

        <div className="dashboard-actions" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={billingPeriod === "monthly" ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => setBillingPeriod("monthly")}
            disabled={billingBusy || hasPaidPlan}
          >
            Monthly
          </button>
          <button
            type="button"
            className={billingPeriod === "yearly" ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => setBillingPeriod("yearly")}
            disabled={billingBusy || hasPaidPlan}
          >
            Yearly · 2 months free
          </button>
          {hasStripeCustomer ? (
            <button type="button" className="btn btn-ghost" disabled={billingBusy || !billingConfigured} onClick={openBillingPortal}>
              Manage billing
            </button>
          ) : null}
        </div>

        <div className="form-grid">
          {PAID_PLANS.map((item) => {
            const isCurrent = effectivePlan === item.plan;
            return (
              <div className="settings-row" key={item.plan} style={{ alignItems: "center" }}>
                <div>
                  <strong>{PLAN_LABELS[item.plan]}</strong>
                  <p style={{ margin: "4px 0 0" }}>{item.summary} · {billingPeriod === "monthly" ? item.monthly : item.yearly}</p>
                </div>
                {isCurrent ? (
                  <span className="plan-pill">Current plan</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={billingBusy || !billingConfigured || hasPaidPlan}
                    onClick={() => startCheckout(item.plan)}
                  >
                    {hasPaidPlan ? "Use portal" : `Choose ${PLAN_LABELS[item.plan]}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

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
              onChange={(event) => setMinimumLiveViewers(Number(event.target.value))
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
        <h2>Platform monitoring</h2>
        <p>YouTube and Twitch API credentials are configured and their server-side schedulers are active. Kick is the remaining platform integration.</p>
        <div className="settings-row"><span>YouTube + Twitch</span><span className="plan-pill">Active</span></div>
        <div className="settings-row"><span>Kick</span><span className="plan-pill">Pending API integration</span></div>
      </section>
    </div>
  );
}
