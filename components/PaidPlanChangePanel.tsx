"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BillingProvider } from "@/lib/billing-provider";
import type { BillingPeriod, PaidPlanName } from "@/lib/plans";
import { PLAN_LABELS, PLAN_LIMITS, normalizePlan } from "@/lib/plans";

type Props = {
  workspaceId: string;
  currentPlan: PaidPlanName;
  billingProvider: BillingProvider;
  billingConfigured: boolean;
  billingHasCustomer: boolean;
};

type Money = {
  amount: string;
  currency: string;
};

type PlanChangeTiming = "immediate" | "next_billing_period";

type BillingResponse = {
  configured?: boolean;
  plan?: string;
  status?: string;
  billing_period?: BillingPeriod | null;
  current_period_end?: string | null;
  pending_plan?: string | null;
  pending_plan_effective_at?: string | null;
  url?: string;
  error?: string;
  blocked?: boolean;
  activeGames?: number;
  targetLimit?: number;
  gamesToPause?: number;
  active_games?: number;
  target_limit?: number;
  games_to_pause?: number;
  current_plan?: string;
  target_plan?: string;
  change_timing?: PlanChangeTiming;
  change_type?: "upgrade" | "downgrade";
  next_billed_at?: string;
  amount_due_now?: Money;
  next_amount?: Money | null;
  applied?: boolean;
  scheduled?: boolean;
  message?: string;
};

type PlanCard = {
  plan: PaidPlanName;
  monthly: string;
  yearly: string;
  description: string;
};

const PLAN_ORDER: Record<PaidPlanName, number> = {
  indie: 1,
  studio: 2,
  publisher: 3,
  crazy: 4,
};

const PLANS: PlanCard[] = [
  { plan: "indie", monthly: "$2.99 / mo", yearly: "$29.90 / yr", description: "For one active game." },
  { plan: "studio", monthly: "$7.99 / mo", yearly: "$79.90 / yr", description: "For up to 5 active games." },
  { plan: "publisher", monthly: "$14.99 / mo", yearly: "$149.90 / yr", description: "For up to 15 active games." },
  { plan: "crazy", monthly: "$24.99 / mo", yearly: "$249.90 / yr", description: "For up to 30 active games." },
];

function formatMoney(money: Money | null | undefined) {
  if (!money) return "Not available";
  const minor = Number(money.amount);
  if (!Number.isFinite(minor)) return `${money.amount} ${money.currency}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "next renewal";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "next renewal";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function gameLimitLabel(plan: PaidPlanName) {
  const limit = PLAN_LIMITS[plan].games;
  return limit === 1 ? "1 active game" : `Up to ${limit} active games`;
}

export default function PaidPlanChangePanel({
  workspaceId,
  currentPlan,
  billingProvider,
  billingConfigured,
  billingHasCustomer,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod | null>(null);
  const [livePlan, setLivePlan] = useState<PaidPlanName>(currentPlan);
  const [renewalAt, setRenewalAt] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PaidPlanName | null>(null);
  const [pendingEffectiveAt, setPendingEffectiveAt] = useState<string | null>(null);
  const [targetPlan, setTargetPlan] = useState<PaidPlanName | null>(null);
  const [timing, setTiming] = useState<PlanChangeTiming>("immediate");
  const [preview, setPreview] = useState<BillingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const billingFunction = billingProvider === "paddle" ? "paddle-billing" : "stripe-billing";
  const targetIsUpgrade = targetPlan ? PLAN_ORDER[targetPlan] > PLAN_ORDER[livePlan] : false;
  const targetIsDowngrade = targetPlan ? PLAN_ORDER[targetPlan] < PLAN_ORDER[livePlan] : false;

  const selectedCard = useMemo(() => PLANS.find((item) => item.plan === targetPlan) ?? null, [targetPlan]);

  async function invoke(action: "status" | "portal" | "change_preview" | "change_plan", extra: Record<string, unknown> = {}) {
    const supabase = createClient();
    const { data, error: functionError } = await supabase.functions.invoke(billingFunction, {
      body: { action, workspace_id: workspaceId, ...extra },
    });
    if (functionError) {
      const context = (functionError as unknown as { context?: Response }).context;
      if (context) {
        try {
          const payload = await context.clone().json() as BillingResponse;
          if (payload?.error) {
            const detailed = new Error(payload.error) as Error & { payload?: BillingResponse };
            detailed.payload = payload;
            throw detailed;
          }
        } catch (contextError) {
          if (contextError instanceof Error && "payload" in contextError) throw contextError;
        }
      }
      throw new Error(functionError.message);
    }
    const result = (data ?? {}) as BillingResponse;
    if (result.error) {
      const detailed = new Error(result.error) as Error & { payload?: BillingResponse };
      detailed.payload = result;
      throw detailed;
    }
    return result;
  }

  async function loadStatus() {
    if (billingProvider !== "paddle") return;
    setStatusBusy(true);
    try {
      const data = await invoke("status");
      const normalized = normalizePlan(data.plan);
      if (normalized !== "free") setLivePlan(normalized);
      setBillingPeriod(data.billing_period === "yearly" ? "yearly" : data.billing_period === "monthly" ? "monthly" : null);
      setRenewalAt(data.current_period_end ?? null);
      const pending = normalizePlan(data.pending_plan);
      setPendingPlan(pending === "free" ? null : pending);
      setPendingEffectiveAt(data.pending_plan_effective_at ?? null);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Could not load plan change status.");
    } finally {
      setStatusBusy(false);
    }
  }

  useEffect(() => {
    if (billingProvider === "paddle") void loadStatus();
    // workspaceId and billingProvider define this panel instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, billingProvider]);

  async function openPortal() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await invoke("portal");
      if (!data.url) throw new Error("Billing portal URL was not returned.");
      window.location.assign(data.url);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Could not open billing portal.");
      setBusy(false);
    }
  }

  async function choosePlan(plan: PaidPlanName) {
    if (plan === livePlan || !billingPeriod) return;
    const nextTiming: PlanChangeTiming = PLAN_ORDER[plan] > PLAN_ORDER[livePlan] ? "immediate" : "next_billing_period";
    setTargetPlan(plan);
    setTiming(nextTiming);
    setPreview(null);
    setError(null);
    setMessage(null);
    await previewChange(plan, nextTiming);
  }

  async function previewChange(plan: PaidPlanName, nextTiming: PlanChangeTiming) {
    setBusy(true);
    setError(null);
    try {
      const data = await invoke("change_preview", { plan, change_timing: nextTiming });
      setPreview(data);
    } catch (previewError) {
      const payload = (previewError as Error & { payload?: BillingResponse }).payload;
      if (payload?.blocked) {
        const activeGames = payload.activeGames ?? payload.active_games ?? 0;
        const targetLimit = payload.targetLimit ?? payload.target_limit ?? PLAN_LIMITS[plan].games;
        setError(`This downgrade needs ${targetLimit} or fewer active games. You currently have ${activeGames}. Pause games first, then try again.`);
      } else {
        setError(previewError instanceof Error ? previewError.message : "Could not preview this plan change.");
      }
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function chooseTiming(nextTiming: PlanChangeTiming) {
    if (!targetPlan || nextTiming === timing) return;
    setTiming(nextTiming);
    setPreview(null);
    await previewChange(targetPlan, nextTiming);
  }

  async function applyChange() {
    if (!targetPlan || !preview) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await invoke("change_plan", { plan: targetPlan, change_timing: timing });
      setMessage(data.message ?? (timing === "immediate" ? "Your upgrade is being applied." : "Your plan change is scheduled."));
      setPreview(null);
      setTargetPlan(null);
      if (data.scheduled) {
        await loadStatus();
      } else {
        window.setTimeout(() => window.location.reload(), 2500);
      }
    } catch (applyError) {
      const payload = (applyError as Error & { payload?: BillingResponse }).payload;
      if (payload?.blocked) {
        const activeGames = payload.activeGames ?? payload.active_games ?? 0;
        const targetLimit = payload.targetLimit ?? payload.target_limit ?? (targetPlan ? PLAN_LIMITS[targetPlan].games : 0);
        setError(`This downgrade needs ${targetLimit} or fewer active games. You currently have ${activeGames}. Pause games first, then try again.`);
      } else {
        setError(applyError instanceof Error ? applyError.message : "Could not apply this plan change.");
      }
    } finally {
      setBusy(false);
    }
  }

  function closeChangeFlow() {
    setOpen(false);
    setTargetPlan(null);
    setPreview(null);
    setError(null);
    setMessage(null);
  }

  if (billingProvider !== "paddle") {
    return (
      <div className="billing-current-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !billingConfigured || !billingHasCustomer} onClick={openPortal}>Manage billing</button>
      </div>
    );
  }

  return (
    <div className="plan-change-root">
      <div className="billing-current-actions">
        {!pendingPlan ? (
          <button type="button" className="btn btn-primary" disabled={busy || statusBusy || !billingConfigured || !billingHasCustomer || !billingPeriod} onClick={() => setOpen((value) => !value)}>
            {open ? "Close plan change" : "Change plan"}
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" disabled={busy || !billingConfigured || !billingHasCustomer} onClick={openPortal}>Manage billing</button>
      </div>

      {pendingPlan ? (
        <div className="plan-change-scheduled">
          <div>
            <span className="kicker">Scheduled plan change</span>
            <strong>{PLAN_LABELS[pendingPlan]}</strong>
          </div>
          <p>Your current {PLAN_LABELS[livePlan]} plan stays active until {formatDate(pendingEffectiveAt)}. The new plan starts after that renewal is successfully paid.</p>
        </div>
      ) : null}

      {message ? <div className="auth-success plan-change-feedback">{message}</div> : null}
      {error ? <div className="auth-error plan-change-feedback">{error}</div> : null}

      {open && !pendingPlan ? (
        <div className="plan-change-flow">
          {!targetPlan ? (
            <>
              <div className="plan-change-head">
                <div>
                  <span className="kicker">Change plan</span>
                  <h3>Keep your current billing period. Change only the game limit.</h3>
                  <p>{billingPeriod === "yearly" ? "Yearly billing" : "Monthly billing"} stays unchanged. Monthly and yearly switching will be handled separately.</p>
                </div>
                <button type="button" className="btn btn-ghost" onClick={closeChangeFlow} disabled={busy}>Cancel</button>
              </div>

              <div className="plan-change-grid">
                {PLANS.map((item) => {
                  const isCurrent = item.plan === livePlan;
                  const upgrade = PLAN_ORDER[item.plan] > PLAN_ORDER[livePlan];
                  return (
                    <article className={`plan-change-card${isCurrent ? " current" : ""}`} key={item.plan}>
                      <div>
                        <div className="plan-change-card-title">
                          <h4>{PLAN_LABELS[item.plan]}</h4>
                          {isCurrent ? <span className="plan-change-current-badge">CURRENT PLAN</span> : null}
                        </div>
                        <p>{item.description}</p>
                      </div>
                      <strong className="plan-change-price">{billingPeriod === "yearly" ? item.yearly : item.monthly}</strong>
                      <span className="plan-change-limit">{gameLimitLabel(item.plan)}</span>
                      <button
                        type="button"
                        className={upgrade ? "btn btn-primary" : "btn btn-ghost"}
                        disabled={isCurrent || busy}
                        onClick={() => void choosePlan(item.plan)}
                      >
                        {isCurrent ? "Current plan" : upgrade ? `Upgrade to ${PLAN_LABELS[item.plan]}` : `Downgrade to ${PLAN_LABELS[item.plan]}`}
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="plan-change-confirm">
              <div className="plan-change-head">
                <div>
                  <span className="kicker">{targetIsUpgrade ? "Upgrade" : "Downgrade"}</span>
                  <h3>{PLAN_LABELS[livePlan]} to {PLAN_LABELS[targetPlan]}</h3>
                  <p>{gameLimitLabel(targetPlan)}. Your {billingPeriod === "yearly" ? "yearly" : "monthly"} billing period stays unchanged.</p>
                </div>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setTargetPlan(null); setPreview(null); setError(null); }}>Back to plans</button>
              </div>

              {targetIsUpgrade ? (
                <div className="plan-change-timing">
                  <button type="button" className={timing === "immediate" ? "active" : ""} disabled={busy} onClick={() => void chooseTiming("immediate")}>
                    <strong>Upgrade now</strong>
                    <span>Get the higher limit immediately. Paddle charges only the prorated difference for the rest of this billing period.</span>
                  </button>
                  <button type="button" className={timing === "next_billing_period" ? "active" : ""} disabled={busy} onClick={() => void chooseTiming("next_billing_period")}>
                    <strong>Upgrade on next renewal</strong>
                    <span>Keep {PLAN_LABELS[livePlan]} until {formatDate(renewalAt)}. Pay the new full plan price when the next billing period starts.</span>
                  </button>
                </div>
              ) : (
                <div className="checkout-security-note">
                  Downgrades start on the next renewal. You keep {PLAN_LABELS[livePlan]} until {formatDate(renewalAt)} and are not charged anything now.
                </div>
              )}

              {busy && !preview ? <div className="status-message">Calculating the exact Paddle billing preview...</div> : null}

              {preview ? (
                <div className="plan-change-summary">
                  <div><span>Plan change</span><strong>{PLAN_LABELS[livePlan]} to {PLAN_LABELS[targetPlan]}</strong></div>
                  <div><span>Effective</span><strong>{timing === "immediate" ? "Immediately" : formatDate(preview.next_billed_at ?? renewalAt)}</strong></div>
                  <div><span>Amount due now</span><strong>{formatMoney(preview.amount_due_now)}</strong></div>
                  <div><span>Next renewal</span><strong>{formatMoney(preview.next_amount)} on {formatDate(preview.next_billed_at ?? renewalAt)}</strong></div>
                </div>
              ) : null}

              {targetIsDowngrade ? (
                <p className="plan-change-help">If you have more than {PLAN_LIMITS[targetPlan].games} active games, the downgrade is blocked until you pause enough games. The system will not choose games to pause for you.</p>
              ) : null}

              <div className="checkout-actions">
                <button type="button" className="btn btn-primary" disabled={busy || !preview} onClick={() => void applyChange()}>
                  {targetIsUpgrade && timing === "immediate" ? `Confirm upgrade now` : `Confirm change for next renewal`}
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setTargetPlan(null); setPreview(null); setError(null); }}>Back</button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
