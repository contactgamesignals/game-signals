"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BillingPeriod, PaidPlanName, PlanName } from "@/lib/plans";
import { PLAN_LABELS, normalizePlan } from "@/lib/plans";

type Props = {
  workspaceId: string;
  currentPlan: PlanName;
  subscriptionStatus: string;
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

type BillingResponse = {
  configured?: boolean;
  plan?: string;
  status?: string;
  has_customer?: boolean;
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

export default function SettingsClient({ workspaceId, currentPlan, subscriptionStatus, hasStripeCustomer }: Props) {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [minimumSignalScore, setMinimumSignalScore] = useState(0);
  const [minimumLiveViewers, setMinimumLiveViewers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [emailDestination, setEmailDestination] = useState("");
  const [emailMinimumSignalScore, setEmailMinimumSignalScore] = useState(0);
  const [emailMinimumLiveViewers, setEmailMinimumLiveViewers] = useState(0);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingChecking, setBillingChecking] = useState(true);
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [billingPlan, setBillingPlan] = useState<PlanName>(currentPlan);
  const [billingStatus, setBillingStatus] = useState(subscriptionStatus);
  const [billingHasCustomer, setBillingHasCustomer] = useState(hasStripeCustomer);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  const effectivePlan = billingStatus === "active" || billingStatus === "trialing" ? billingPlan : "free";
  const hasPaidPlan = effectivePlan !== "free";

  async function invokeDiscord(action: "status" | "upsert" | "delete" | "test", extra: Record<string, unknown> = {}) {
    const supabase = createClient();
    const { data, error: functionError } = await supabase.functions.invoke("manage-discord", {
      body: { action, workspace_id: workspaceId, ...extra },
    });
    if (functionError) throw new Error(functionError.message);
    if (data?.error) throw new Error(String(data.error));
    return data as Record<string, unknown>;
  }

  async function invokeEmail(action: "status" | "upsert" | "delete" | "test", extra: Record<string, unknown> = {}) {
    const supabase = createClient();
    const { data, error: functionError } = await supabase.functions.invoke("manage-email", {
      body: { action, workspace_id: workspaceId, ...extra },
    });
    if (functionError) throw new Error(functionError.message);
    if (data?.error) throw new Error(String(data.error));
    return data as Record<string, unknown>;
  }

  async function invokeBilling(action: "status" | "checkout" | "portal", extra: Record<string, unknown> = {}) {
    const supabase = createClient();
    const { data, error: functionError } = await supabase.functions.invoke("stripe-billing", {
      body: { action, workspace_id: workspaceId, ...extra },
    });
    if (functionError) throw new Error(functionError.message);
    const result = data as BillingResponse | null;
    if (result?.error) throw new Error(result.error);
    return result ?? {};
  }

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const data = await invokeDiscord("status");
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
          plan: String(data.plan ?? "free"),
          provider_configured: Boolean(data.provider_configured),
        };
        setEmailStatus(nextStatus);
        setEmailDestination(nextStatus.destination);
        setEmailMinimumSignalScore(nextStatus.minimum_signal_score);
        setEmailMinimumLiveViewers(nextStatus.minimum_live_viewers);
      } catch (statusError) {
        if (active) setEmailError(statusError instanceof Error ? statusError.message : "Could not load email settings.");
      }
    })();

    void (async () => {
      try {
        const data = await invokeBilling("status");
        if (!active) return;
        setBillingConfigured(Boolean(data.configured));
        setBillingPlan(normalizePlan(data.plan));
        setBillingStatus(String(data.status ?? "trialing"));
        setBillingHasCustomer(Boolean(data.has_customer));
      } catch (statusError) {
        if (active) setBillingError(statusError instanceof Error ? statusError.message : "Could not load billing status.");
      } finally {
        if (active) setBillingChecking(false);
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
      const data = await invokeDiscord("upsert", {
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
      await invokeDiscord("test");
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
      await invokeDiscord("delete");
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

  async function saveEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailStatus?.allowed || !emailStatus.provider_configured) return;
    setEmailBusy(true);
    setEmailError(null);
    setEmailMessage(null);
    try {
      const data = await invokeEmail("upsert", {
        email: emailDestination,
        minimum_signal_score: emailMinimumSignalScore,
        minimum_live_viewers: emailMinimumLiveViewers,
      });
      setEmailStatus((current) => ({
        configured: true,
        enabled: true,
        destination: String(data.destination ?? emailDestination),
        minimum_signal_score: Number(data.minimum_signal_score ?? emailMinimumSignalScore),
        minimum_live_viewers: Number(data.minimum_live_viewers ?? emailMinimumLiveViewers),
        allowed: Boolean(data.allowed ?? current?.allowed),
        plan: String(data.plan ?? current?.plan ?? "free"),
        provider_configured: Boolean(data.provider_configured ?? current?.provider_configured),
      }));
      setEmailMessage("Email alerts saved.");
    } catch (saveError) {
      setEmailError(saveError instanceof Error ? saveError.message : "Could not save email alerts.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function testEmail() {
    if (!emailStatus?.allowed || !emailStatus.provider_configured) return;
    setEmailBusy(true);
    setEmailError(null);
    setEmailMessage(null);
    try {
      await invokeEmail("test");
      setEmailMessage("Test notification sent by email.");
    } catch (testError) {
      setEmailError(testError instanceof Error ? testError.message : "Could not send the test email.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function removeEmail() {
    if (!window.confirm("Remove email alerts from this workspace?")) return;
    setEmailBusy(true);
    setEmailError(null);
    setEmailMessage(null);
    try {
      const data = await invokeEmail("delete");
      setEmailStatus((current) => ({
        configured: false,
        enabled: false,
        destination: emailDestination,
        minimum_signal_score: 0,
        minimum_live_viewers: 0,
        allowed: Boolean(data.allowed ?? current?.allowed),
        plan: String(data.plan ?? current?.plan ?? "free"),
        provider_configured: Boolean(data.provider_configured ?? current?.provider_configured),
      }));
      setEmailMinimumSignalScore(0);
      setEmailMinimumLiveViewers(0);
      setEmailMessage("Email alerts removed.");
    } catch (removeError) {
      setEmailError(removeError instanceof Error ? removeError.message : "Could not remove email alerts.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function openBillingPortal() {
    setBillingBusy(true);
    setBillingError(null);
    setBillingMessage(null);
    try {
      const data = await invokeBilling("portal");
      if (!data.url) throw new Error("Stripe did not return a billing portal URL.");
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
      const data = await invokeBilling("checkout", { plan, period: billingPeriod });
      if (data.usePortal) {
        setBillingBusy(false);
        await openBillingPortal();
        return;
      }
      if (!data.url) throw new Error("Stripe did not return a Checkout URL.");
      window.location.assign(data.url);
    } catch (checkoutError) {
      setBillingError(checkoutError instanceof Error ? checkoutError.message : "Could not create Checkout session.");
      setBillingBusy(false);
    }
  }

  const discordLocked = status !== null && !status.allowed;
  const emailLocked = emailStatus !== null && (!emailStatus.allowed || !emailStatus.provider_configured);

  return (
    <div className="settings-grid">
      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Billing</h2>
            <p>Stripe-hosted Checkout for subscriptions and a secure billing portal for existing customers.</p>
          </div>
          <span className="plan-pill">
            {billingChecking ? "Checking…" : `${PLAN_LABELS[effectivePlan]} · ${billingStatus}`}
          </span>
        </div>

        {!billingChecking && !billingConfigured ? (
          <div className="status-message" style={{ marginBottom: 14 }}>
            Stripe backend is deployed. Add the Stripe sandbox secret to Supabase to enable Checkout.
          </div>
        ) : null}
        {billingMessage ? <div className="auth-success" style={{ marginBottom: 14 }}>{billingMessage}</div> : null}
        {billingError ? <div className="auth-error" style={{ marginBottom: 14 }}>{billingError}</div> : null}

        <div className="dashboard-actions" style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={billingPeriod === "monthly" ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => setBillingPeriod("monthly")}
            disabled={billingBusy || billingChecking || hasPaidPlan}
          >
            Monthly
          </button>
          <button
            type="button"
            className={billingPeriod === "yearly" ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => setBillingPeriod("yearly")}
            disabled={billingBusy || billingChecking || hasPaidPlan}
          >
            Yearly · 2 months free
          </button>
          {billingHasCustomer ? (
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
                    disabled={billingBusy || billingChecking || !billingConfigured || hasPaidPlan}
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
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Email alerts</h2>
            <p>Receive a direct email when a new signal passes your selected thresholds.</p>
          </div>
          <span className="plan-pill">
            {!emailStatus
              ? "Checking…"
              : !emailStatus.allowed
                ? "Paid plan required"
                : !emailStatus.provider_configured
                  ? "Provider required"
                  : emailStatus.configured
                    ? "Connected"
                    : "Not connected"}
          </span>
        </div>

        {emailStatus && !emailStatus.allowed ? (
          <div className="status-message" style={{ marginBottom: 14 }}>
            Email alerts require an active paid plan. Your current plan is <strong>{emailStatus.plan}</strong>.
          </div>
        ) : null}
        {emailStatus?.allowed && !emailStatus.provider_configured ? (
          <div className="status-message" style={{ marginBottom: 14 }}>
            Email delivery backend is deployed. Configure a verified Resend sender and the Supabase secrets <code>RESEND_API_KEY</code> and <code>RESEND_FROM_EMAIL</code> to enable delivery.
          </div>
        ) : null}
        {emailMessage ? <div className="auth-success" style={{ marginBottom: 14 }}>{emailMessage}</div> : null}
        {emailError ? <div className="auth-error" style={{ marginBottom: 14 }}>{emailError}</div> : null}

        <form className="form-grid" onSubmit={saveEmail}>
          <label>
            Notification email
            <input
              className="app-input"
              type="email"
              value={emailDestination}
              onChange={(event) => setEmailDestination(event.target.value)}
              placeholder="alerts@studio.com"
              required
              autoComplete="email"
              disabled={emailBusy || emailLocked}
            />
          </label>
          <label>
            Minimum signal score: {emailMinimumSignalScore}
            <input
              className="range"
              type="range"
              min="0"
              max="100"
              value={emailMinimumSignalScore}
              onChange={(event) => setEmailMinimumSignalScore(Number(event.target.value))}
              disabled={emailBusy || emailLocked}
            />
          </label>
          <label>
            Minimum viewers for live streams
            <input
              className="app-input"
              type="number"
              min="0"
              step="1"
              value={emailMinimumLiveViewers}
              onChange={(event) => setEmailMinimumLiveViewers(Number(event.target.value))}
              disabled={emailBusy || emailLocked}
            />
          </label>
          <div className="dashboard-actions">
            <button className="btn btn-primary" disabled={emailBusy || emailLocked || !emailDestination.trim()}>
              {emailStatus?.configured ? "Save email settings" : "Connect email"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={emailBusy || emailLocked || !emailStatus?.configured}
              onClick={testEmail}
            >
              Send test
            </button>
            {emailStatus?.configured ? (
              <button className="icon-btn danger" type="button" disabled={emailBusy} onClick={removeEmail}>
                Remove
              </button>
            ) : null}
          </div>
        </form>
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
