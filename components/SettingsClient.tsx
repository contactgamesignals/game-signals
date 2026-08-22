"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import EmailDigestSettings from "@/components/EmailDigestSettings";
import PaidPlanChangePanel from "@/components/PaidPlanChangePanel";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";
import type { BillingPeriod, PaidPlanName, PlanName } from "@/lib/plans";
import { PLAN_LABELS, PLAN_LIMITS, normalizePlan } from "@/lib/plans";
import { BILLING_PROVIDER_LABELS, type BillingProvider } from "@/lib/billing-provider";

type Props = {
  workspaceId: string;
  currentPlan: PlanName;
  subscriptionStatus: string;
  billingProvider: BillingProvider;
  billingHasCustomer: boolean;
  billingHasSubscription: boolean;
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
  has_subscription?: boolean;
  url?: string;
  error?: string;
  usePortal?: boolean;
};

type BuyerType = "individual" | "company";

type PlanCard = {
  plan: PaidPlanName;
  stripeMonthly: string;
  stripeYearly: string;
  paddleMonthly: string;
  paddleYearly: string;
  description: string;
  featured?: boolean;
};

const LAUNCH_BILLING_COUNTRY = "PL";

const PAID_PLANS: PlanCard[] = [
  {
    plan: "indie",
    stripeMonthly: "24.50 PLN / mo",
    stripeYearly: "245 PLN / yr",
    paddleMonthly: "$2.99 / mo",
    paddleYearly: "$29.90 / yr",
    description: "For solo developers or a small team with one active title.",
  },
  {
    plan: "studio",
    stripeMonthly: "64.50 PLN / mo",
    stripeYearly: "645 PLN / yr",
    paddleMonthly: "$7.99 / mo",
    paddleYearly: "$79.90 / yr",
    description: "For studios monitoring several active games and launches.",
    featured: true,
  },
  {
    plan: "publisher",
    stripeMonthly: "149.50 PLN / mo",
    stripeYearly: "1495 PLN / yr",
    paddleMonthly: "$14.99 / mo",
    paddleYearly: "$149.90 / yr",
    description: "For publishers and teams running a larger game portfolio.",
  },
  {
    plan: "crazy",
    stripeMonthly: "$24.99 / mo",
    stripeYearly: "$249.90 / yr",
    paddleMonthly: "$24.99 / mo",
    paddleYearly: "$249.90 / yr",
    description: "For high-output teams and publishers monitoring a very large game portfolio.",
  },
];

const SHARED_FEATURES = [
  "YouTube + Twitch monitoring",
  "Live creator signal dashboard",
  "Discord alerts",
  "Opt-in daily email digest",
  "CSV signal export",
  "Aliases and exclusion terms",
  "Fastest paid monitoring cadence",
];

function gameLimitLabel(plan: PaidPlanName) {
  const limit = PLAN_LIMITS[plan].games;
  return limit === 1 ? "1 active tracked game" : `Up to ${limit} active games`;
}

export default function SettingsClient({
  workspaceId,
  currentPlan,
  subscriptionStatus,
  billingProvider,
  billingHasCustomer: initialBillingHasCustomer,
  billingHasSubscription: initialBillingHasSubscription,
}: Props) {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
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
  const [billingHasCustomer, setBillingHasCustomer] = useState(initialBillingHasCustomer);
  const [billingHasSubscription, setBillingHasSubscription] = useState(initialBillingHasSubscription);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PaidPlanName | null>(null);
  const [buyerType, setBuyerType] = useState<BuyerType>("individual");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [recurringBillingAccepted, setRecurringBillingAccepted] = useState(false);
  const [immediateServiceRequested, setImmediateServiceRequested] = useState(false);
  const [checkoutAttempted, setCheckoutAttempted] = useState(false);

  const effectivePlan = billingStatus === "active" || billingStatus === "trialing" ? billingPlan : "free";
  const hasPaidPlan = effectivePlan !== "free";
  const hasExistingSubscription = billingHasSubscription && billingStatus !== "canceled";
  const providerLabel = BILLING_PROVIDER_LABELS[billingProvider];
  const billingFunction = billingProvider === "paddle" ? "paddle-billing" : "stripe-billing";
  const checkoutConsentsReady =
    termsAccepted &&
    recurringBillingAccepted &&
    (buyerType === "company" || immediateServiceRequested);

  function priceLabel(item: PlanCard) {
    if (billingProvider === "paddle") {
      return billingPeriod === "monthly" ? item.paddleMonthly : item.paddleYearly;
    }
    return billingPeriod === "monthly" ? item.stripeMonthly : item.stripeYearly;
  }

  function selectPlan(plan: PaidPlanName) {
    setSelectedPlan(plan);
    setTermsAccepted(false);
    setRecurringBillingAccepted(false);
    setImmediateServiceRequested(false);
    setCheckoutAttempted(false);
    setBillingError(null);
    window.setTimeout(() => document.getElementById("checkout-consents")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

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
    const { data, error: functionError } = await supabase.functions.invoke(billingFunction, {
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
        setBillingHasSubscription(Boolean(data.has_subscription));
      } catch (statusError) {
        if (active) setBillingError(statusError instanceof Error ? statusError.message : "Could not load billing status.");
      } finally {
        if (active) setBillingChecking(false);
      }
    })();

    const billingResult = new URLSearchParams(window.location.search).get("billing");
    if (billingResult === "success") {
      setBillingMessage(`Checkout completed. ${providerLabel} is synchronizing your subscription now.`);
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
        minimum_signal_score: 0,
        minimum_live_viewers: minimumLiveViewers,
      });
      setStatus((current) => ({
        configured: true,
        enabled: true,
        minimum_signal_score: 0,
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
      if (!data.url) throw new Error(`${providerLabel} did not return a billing portal URL.`);
      window.location.assign(data.url);
    } catch (portalError) {
      setBillingError(portalError instanceof Error ? portalError.message : "Could not open billing portal.");
      setBillingBusy(false);
    }
  }

  async function startCheckout(plan: PaidPlanName) {
    if (!billingConfigured || hasPaidPlan || hasExistingSubscription) return;
    setCheckoutAttempted(true);
    if (!checkoutConsentsReady) {
      setBillingError(null);
      return;
    }
    setCheckoutAttempted(false);
    setBillingBusy(true);
    setBillingError(null);
    setBillingMessage(null);
    try {
      const data = await invokeBilling("checkout", {
        plan,
        period: billingPeriod,
        buyer_type: buyerType,
        ...(billingProvider === "stripe" ? { billing_country: LAUNCH_BILLING_COUNTRY } : {}),
        terms_accepted: termsAccepted,
        recurring_billing_accepted: recurringBillingAccepted,
        immediate_service_requested: buyerType === "individual" ? immediateServiceRequested : false,
      });
      if (data.usePortal) {
        setBillingBusy(false);
        await openBillingPortal();
        return;
      }
      if (!data.url) throw new Error(`${providerLabel} did not return a Checkout URL.`);
      window.location.assign(data.url);
    } catch (checkoutError) {
      setBillingError(checkoutError instanceof Error ? checkoutError.message : "Could not create Checkout session.");
      setBillingBusy(false);
    }
  }

  const discordLocked = status !== null && !status.allowed;
  const discordConnected = Boolean(status?.configured && status?.enabled);
  const selectedPlanCard = selectedPlan ? PAID_PLANS.find((item) => item.plan === selectedPlan) ?? null : null;

  return (
    <div className="settings-grid">
      <section className="settings-card billing-card" id="billing">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2>Billing</h2>
            <p>{hasPaidPlan ? "Manage your current subscription and billing." : "Choose the game limit that fits your team."}</p>
          </div>
          <span className="plan-pill">
            {billingChecking ? "Checking…" : hasPaidPlan ? `${PLAN_LABELS[effectivePlan]} · ${billingStatus}` : "No active plan"}
          </span>
        </div>

        {!billingChecking && !billingConfigured ? (
          <div className="status-message" style={{ marginBottom: 14 }}>
            Billing is temporarily unavailable. Please try again later.
          </div>
        ) : null}
        {billingMessage ? <div className="auth-success" style={{ marginBottom: 14 }}>{billingMessage}</div> : null}
        {billingError ? <div className="auth-error" style={{ marginBottom: 14 }}>{billingError}</div> : null}

        {hasPaidPlan || hasExistingSubscription ? (
          <div className="billing-current-plan">
            <div>
              <span className="kicker">Current subscription</span>
              <h3>{hasPaidPlan ? PLAN_LABELS[effectivePlan] : "Subscription"}</h3>
              <p>{hasPaidPlan ? gameLimitLabel(effectivePlan as PaidPlanName) : "Manage your subscription in the billing portal."}</p>
            </div>
            {hasPaidPlan ? (
              <PaidPlanChangePanel
                workspaceId={workspaceId}
                currentPlan={effectivePlan as PaidPlanName}
                billingProvider={billingProvider}
                billingConfigured={billingConfigured}
                billingHasCustomer={billingHasCustomer}
              />
            ) : (
              <button type="button" className="btn btn-primary" disabled={billingBusy || !billingConfigured || !billingHasCustomer} onClick={openBillingPortal}>
                Manage billing
              </button>
            )}
            <p className="billing-portal-note">
              Change your game limit here. Payment methods, billing documents and cancellation stay in the billing portal.
            </p>
          </div>
        ) : selectedPlanCard ? (
          <div className="checkout-step" id="checkout-consents">
            <div className="checkout-step-head">
              <div>
                <div className="kicker">Step 2 of 2</div>
                <h3>Confirm {PLAN_LABELS[selectedPlanCard.plan]}</h3>
                <p>{gameLimitLabel(selectedPlanCard.plan)} · {priceLabel(selectedPlanCard)}</p>
              </div>
              <button type="button" className="btn btn-ghost" disabled={billingBusy} onClick={() => { setSelectedPlan(null); setCheckoutAttempted(false); setBillingError(null); }}>
                Change plan
              </button>
            </div>

            <div className="checkout-security-note">
              {billingProvider === "paddle"
                ? "Secure checkout by Paddle. Final tax is shown at checkout."
                : "Secure checkout by Stripe. Final billing details are collected at checkout."}
            </div>

            <div className="checkout-buyer-block">
              <strong>Who is buying?</strong>
              <p className="form-help">Choose the billing profile for this subscription.</p>
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
            </div>

            <div className="checkout-consents">
              <label>
                <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} disabled={billingBusy} />
                <span>
                  I accept the <Link href="/terms" target="_blank">Terms</Link> and confirm that I have read the <Link href="/privacy" target="_blank">Privacy Policy</Link>.
                </span>
              </label>

              <label>
                <input type="checkbox" checked={recurringBillingAccepted} onChange={(event) => setRecurringBillingAccepted(event.target.checked)} disabled={billingBusy} />
                <span>
                  I understand this is a recurring subscription charged in advance every {billingPeriod === "monthly" ? "month" : "year"} until cancelled. Cancellation applies at the end of the current paid period.
                </span>
              </label>

              {buyerType === "individual" ? (
                <label>
                  <input type="checkbox" checked={immediateServiceRequested} onChange={(event) => setImmediateServiceRequested(event.target.checked)} disabled={billingBusy} />
                  <span>
                    I request immediate access to the service before the 14-day withdrawal period ends. If I withdraw after service starts, I may owe a proportionate amount for the service already provided. Mandatory consumer rights remain unaffected.
                  </span>
                </label>
              ) : (
                <div className="form-help">Company purchase. Any mandatory rights that apply by law remain unaffected.</div>
              )}
            </div>

            {checkoutAttempted && !checkoutConsentsReady ? (
              <div className="auth-error">Please accept all required statements above before continuing to checkout.</div>
            ) : null}

            <div className="checkout-actions">
              <button type="button" className="btn btn-primary" disabled={billingBusy || billingChecking || !billingConfigured} onClick={() => startCheckout(selectedPlanCard.plan)}>
                Continue to secure checkout
              </button>
              <button type="button" className="btn btn-ghost" disabled={billingBusy} onClick={() => setSelectedPlan(null)}>
                Back to plans
              </button>
            </div>
          </div>
        ) : (
          <div className="plan-picker">
            <div className="plan-picker-intro">
              <div>
                <div className="kicker">Step 1 of 2</div>
                <h3>Choose your plan</h3>
                <p>Every paid plan includes the same features. Only the number of active games changes.</p>
              </div>
              <div className="plan-cycle-toggle" aria-label="Billing period">
                <button type="button" className={billingPeriod === "monthly" ? "active" : ""} onClick={() => setBillingPeriod("monthly")} disabled={billingBusy || billingChecking}>Monthly</button>
                <button type="button" className={billingPeriod === "yearly" ? "active" : ""} onClick={() => setBillingPeriod("yearly")} disabled={billingBusy || billingChecking}>Yearly · 2 months free</button>
              </div>
            </div>

            <div className="plan-picker-grid">
              {PAID_PLANS.map((item) => (
                <article className={`plan-choice-card${item.featured ? " featured" : ""}`} key={item.plan}>
                  <div className="plan-choice-heading">
                    <div>
                      <h3>{PLAN_LABELS[item.plan]}</h3>
                      <p>{item.description}</p>
                    </div>
                    {item.featured ? <span className="popular">MOST POPULAR</span> : null}
                  </div>
                  <div className="plan-choice-price">{priceLabel(item)}</div>
                  <div className="same-feature-badge">Same full feature set</div>
                  <ul className="plan-choice-features">
                    {[gameLimitLabel(item.plan), ...SHARED_FEATURES].map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                  <button type="button" className={item.featured ? "btn btn-primary" : "btn btn-ghost"} disabled={billingBusy || billingChecking || !billingConfigured} onClick={() => selectPlan(item.plan)}>
                    Choose {PLAN_LABELS[item.plan]}
                  </button>
                </article>
              ))}
            </div>
            <div className="custom-plan-note">
              <div>
                <strong>Need more than 30 active games?</strong>
                <span>We can set up a custom plan for larger portfolios.</span>
              </div>
              <a className="btn btn-ghost" href={`mailto:${BRAND.supportEmail}?subject=Custom%20Who%20Plays%20My%20Game%20plan`}>Contact support</a>
            </div>
          </div>
        )}
      </section>

      <section className="settings-card">
        <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
          <div>
            <h2><span className="service-mark discord" aria-hidden="true" />Discord alerts</h2>
            <p>Get creator signals in a Discord channel. The webhook URL stays server-side and is never returned after saving.</p>
          </div>
          <span className="plan-pill">
            {!status ? "Checking…" : !status.allowed ? "Paid plan required" : discordConnected ? "Connected" : "Not connected"}
          </span>
        </div>

        {discordLocked ? (
          <div className="status-message" style={{ marginBottom: 14 }}>
            Discord alerts are included in every paid plan. A saved webhook is not used without an active paid subscription.
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
            Minimum viewers for Twitch live streams
            <input className="app-input" type="number" min="0" step="1" value={minimumLiveViewers} onChange={(event) => setMinimumLiveViewers(Number(event.target.value))} disabled={busy || discordLocked} />
          </label>
          <div className="dashboard-actions">
            <button className="btn btn-primary" disabled={busy || discordLocked || !webhookUrl.trim()}><span className="service-mark discord" aria-hidden="true" />{status?.configured ? "Replace webhook" : "Connect Discord"}</button>
            <button className="btn btn-ghost" type="button" disabled={busy || discordLocked || !status?.configured} onClick={testDiscord}><span className="service-mark discord" aria-hidden="true" />Send test</button>
            {status?.configured ? <button className="icon-btn danger" type="button" disabled={busy} onClick={removeDiscord}>Remove</button> : null}
          </div>
        </form>
      </section>

      <EmailDigestSettings workspaceId={workspaceId} />
    </div>
  );
}
