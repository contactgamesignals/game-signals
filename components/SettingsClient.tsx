"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
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

type BillingResponse = {
  configured?: boolean;
  plan?: string;
  status?: string;
  has_customer?: boolean;
  url?: string;
  error?: string;
  usePortal?: boolean;
};

type BuyerType = "individual" | "company";

const PAID_PLANS: Array<{
  plan: PaidPlanName;
  monthly: string;
  yearly: string;
  summary: string;
}> = [
  { plan: "indie", monthly: "24.50 PLN / mo", yearly: "245 PLN / yr", summary: "1 active game" },
  { plan: "studio", monthly: "64.50 PLN / mo", yearly: "645 PLN / yr", summary: "Up to 3 active games + Discord" },
  { plan: "publisher", monthly: "149.50 PLN / mo", yearly: "1495 PLN / yr", summary: "Up to 10 active games + export" },
];

export default function SettingsClient({ workspaceId, currentPlan, subscriptionStatus, hasStripeCustomer }: Props) {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [minimumSignalScore, setMinimumSignalScore] = useState(0);
  const [minimumLiveViewers, setMinimumLiveViewers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingChecking, setBillingChecking] = useState(true);
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [billingPlan, setBillingPlan] = useState<PlanName>(currentPlan);
  const [billingStatus, setBillingStatus] = useState(subscriptionStatus);
  const [billingHasCustomer, setBillingHasCustomer] = useState(hasStripeCustomer);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [buyerType, setBuyerType] = useState<BuyerType>("individual");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [recurringBillingAccepted, setRecurringBillingAccepted] = useState(false);
  const [immediateServiceRequested, setImmediateServiceRequested] = useState(false);

  const effectivePlan = billingStatus === "active" || billingStatus === "trialing" ? billingPlan : "free";
  const hasPaidPlan = effectivePlan !== "free";
  const checkoutConsentsReady =
    termsAccepted &&
    recurringBillingAccepted &&
    (buyerType === "company" || immediateServiceRequested);

  async function invokeDiscord(action: "status" | "upsert" | "delete" | "test", extra: Record<string, unknown> = {}) {
    const supabase = createClient();
    const { data, error: functionError } = await supabase.functions.invoke("manage-discord", {
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
    if (!checkoutConsentsReady) {
      setBillingError("Choose Individual or Company and accept the required checkout statements first.");
      return;
    }
    setBillingBusy(true);
    setBillingError(null);
    setBillingMessage(null);
    try {
      const data = await invokeBilling("checkout", {
        plan,
        period: billingPeriod,
        buyer_type: buyerType,
        terms_accepted: termsAccepted,
        recurring_billing_accepted: recurringBillingAccepted,
        immediate_service_requested: buyerType === "individual" ? immediateServiceRequested : false,
      });
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
  const discordConnected = Boolean(status?.configured && status?.enabled);

  return (
    <div className="settings-grid">
      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Billing</h2>
            <p>Choose a plan with Stripe Checkout. Existing subscriptions are changed or cancelled securely in Stripe Customer Portal.</p>
          </div>
          <span className="plan-pill">
            {billingChecking ? "Checking…" : `${PLAN_LABELS[effectivePlan]} · ${billingStatus}`}
          </span>
        </div>

        {!billingChecking && !billingConfigured ? (
          <div className="status-message" style={{ marginBottom: 14 }}>
            Billing is temporarily unavailable. Please try again later.
          </div>
        ) : null}
        {billingMessage ? <div className="auth-success" style={{ marginBottom: 14 }}>{billingMessage}</div> : null}
        {billingError ? <div className="auth-error" style={{ marginBottom: 14 }}>{billingError}</div> : null}

        <div className="dashboard-actions" style={{ marginBottom: 14 }}>
          {!hasPaidPlan ? (
            <>
              <button type="button" className={billingPeriod === "monthly" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setBillingPeriod("monthly")} disabled={billingBusy || billingChecking}>Monthly</button>
              <button type="button" className={billingPeriod === "yearly" ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setBillingPeriod("yearly")} disabled={billingBusy || billingChecking}>Yearly · 2 months free</button>
            </>
          ) : null}
          {billingHasCustomer ? (
            <button type="button" className="btn btn-ghost" disabled={billingBusy || !billingConfigured} onClick={openBillingPortal}>
              Manage billing
            </button>
          ) : null}
        </div>

        {!hasPaidPlan ? (
          <div className="form-grid" style={{ marginBottom: 18 }}>
            <div>
              <strong>Who is buying?</strong>
              <p className="form-help" style={{ marginTop: 5 }}>Choose how the subscription should be purchased and documented.</p>
            </div>
            <div className="dashboard-actions">
              <button
                type="button"
                className={buyerType === "individual" ? "btn btn-primary" : "btn btn-ghost"}
                onClick={() => { setBuyerType("individual"); setImmediateServiceRequested(false); }}
                disabled={billingBusy}
              >
                Individual / solo
              </button>
              <button
                type="button"
                className={buyerType === "company" ? "btn btn-primary" : "btn btn-ghost"}
                onClick={() => { setBuyerType("company"); setImmediateServiceRequested(false); }}
                disabled={billingBusy}
              >
                Company / business
              </button>
            </div>

            <div className="status-message">
              {buyerType === "company"
                ? "Stripe Checkout will collect the billing address and, where supported for the selected country, require the company legal name and VAT/tax ID."
                : "Stripe Checkout will collect your billing address as an individual. Company VAT/tax fields will not be required."}
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} disabled={billingBusy} style={{ marginTop: 3 }} />
              <span>
                I accept the <Link href="/terms" target="_blank">Terms</Link> and confirm that I have read the <Link href="/privacy" target="_blank">Privacy Policy</Link>.
              </span>
            </label>

            <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <input type="checkbox" checked={recurringBillingAccepted} onChange={(event) => setRecurringBillingAccepted(event.target.checked)} disabled={billingBusy} style={{ marginTop: 3 }} />
              <span>
                I understand this is a recurring subscription charged in advance every {billingPeriod === "monthly" ? "month" : "year"} until cancelled. Cancellation takes effect at the end of the current paid period. Payments are generally non-refundable and no credits are provided for partially used billing periods, except where required by applicable law.
              </span>
            </label>

            {buyerType === "individual" ? (
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input type="checkbox" checked={immediateServiceRequested} onChange={(event) => setImmediateServiceRequested(event.target.checked)} disabled={billingBusy} style={{ marginTop: 3 }} />
                <span>
                  I expressly request that GameSignal starts providing the digital service immediately, before the 14-day withdrawal period ends. I understand that if I validly withdraw during that period, I may have to pay a proportionate amount for the service already provided, and mandatory consumer rights remain unaffected.
                </span>
              </label>
            ) : (
              <div className="form-help">
                Company purchase. Mandatory rights that apply by law to a particular business customer, including any statutory protections for qualifying sole traders, are not excluded.
              </div>
            )}
          </div>
        ) : null}

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
                ) : hasPaidPlan ? (
                  <button type="button" className="btn btn-ghost" disabled={billingBusy || !billingConfigured || !billingHasCustomer} onClick={openBillingPortal}>
                    Change plan
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" disabled={billingBusy || billingChecking || !billingConfigured || !checkoutConsentsReady} onClick={() => startCheckout(item.plan)}>
                    Continue with {PLAN_LABELS[item.plan]}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {hasPaidPlan ? (
          <div className="status-message" style={{ marginTop: 14 }}>
            Plan changes, monthly/yearly switching, payment methods, invoices and cancellation are handled in Stripe Customer Portal. Cancellation applies at the end of the paid period; unused time is not normally refunded or credited except where required by law.
          </div>
        ) : null}
      </section>

      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Discord alerts</h2>
            <p>Get creator signals in a Discord channel. The webhook URL stays server-side and is never returned after saving.</p>
          </div>
          <span className="plan-pill">
            {!status ? "Checking…" : !status.allowed ? "Studio+ required" : discordConnected ? "Connected" : "Not connected"}
          </span>
        </div>

        {discordLocked ? (
          <div className="status-message" style={{ marginBottom: 14 }}>
            Discord alerts are included in Studio and Publisher. A saved webhook is not used while the workspace is on an ineligible plan.
          </div>
        ) : null}
        {message ? <div className="auth-success" style={{ marginBottom: 14 }}>{message}</div> : null}
        {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

        <form className="form-grid" onSubmit={saveDiscord}>
          <label>
            {status?.configured ? "Replace webhook URL" : "Discord webhook URL"}
            <input className="app-input" type="url" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://discord.com/api/webhooks/..." required autoComplete="off" disabled={busy || discordLocked} />
            <span className="form-help">Discord → Server Settings → Integrations → Webhooks.</span>
          </label>
          <label>
            Minimum signal score: {minimumSignalScore}
            <input className="range" type="range" min="0" max="100" value={minimumSignalScore} onChange={(event) => setMinimumSignalScore(Number(event.target.value))} disabled={busy || discordLocked} />
          </label>
          <label>
            Minimum viewers for Twitch live streams
            <input className="app-input" type="number" min="0" step="1" value={minimumLiveViewers} onChange={(event) => setMinimumLiveViewers(Number(event.target.value))} disabled={busy || discordLocked} />
          </label>
          <div className="dashboard-actions">
            <button className="btn btn-primary" disabled={busy || discordLocked || !webhookUrl.trim()}>{status?.configured ? "Replace webhook" : "Connect Discord"}</button>
            <button className="btn btn-ghost" type="button" disabled={busy || discordLocked || !status?.configured} onClick={testDiscord}>Send test</button>
            {status?.configured ? <button className="icon-btn danger" type="button" disabled={busy} onClick={removeDiscord}>Remove</button> : null}
          </div>
        </form>
      </section>

      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Email alerts</h2>
            <p>The delivery pipeline is implemented and tested. Production sending remains disabled until GameSignal has a verified sending domain.</p>
          </div>
          <span className="plan-pill">Coming soon</span>
        </div>
      </section>

      <section className="settings-card">
        <h2>Platform monitoring</h2>
        <p>YouTube and Twitch monitoring is live. Kick remains disabled until the required API/commercial approval is in place.</p>
        <div className="settings-row"><span>YouTube</span><span className="plan-pill">Active</span></div>
        <div className="settings-row"><span>Twitch</span><span className="plan-pill">Active</span></div>
        <div className="settings-row"><span>Kick</span><span className="plan-pill">Coming soon</span></div>
      </section>
    </div>
  );
}
