"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PLAN_LABELS, type PlanName } from "@/lib/plans";

type Props = {
  workspaceId: string;
  plan: PlanName;
  subscriptionStatus: string;
  hostedInvoiceUrl: string | null;
  invoiceNumber: string | null;
  amountRemaining: number | null;
  currency: string | null;
  attemptCount: number | null;
  nextPaymentAttempt: string | null;
};

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null || !currency) return null;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatRetryDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function BillingRecoveryCard({
  workspaceId,
  plan,
  subscriptionStatus,
  hostedInvoiceUrl,
  invoiceNumber,
  amountRemaining,
  currency,
  attemptCount,
  nextPaymentAttempt,
}: Props) {
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formattedAmount = formatMoney(amountRemaining, currency);
  const retryDate = formatRetryDate(nextPaymentAttempt);

  async function openBillingPortal() {
    setPortalBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: functionError } = await supabase.functions.invoke("stripe-billing", {
        body: { action: "portal", workspace_id: workspaceId },
      });
      if (functionError) throw new Error(functionError.message);
      if (data?.error) throw new Error(String(data.error));
      if (!data?.url) throw new Error("Stripe did not return a billing portal URL.");
      window.location.assign(String(data.url));
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Could not open billing management.");
      setPortalBusy(false);
    }
  }

  return (
    <section className="settings-card" style={{ borderColor: "rgba(255, 174, 66, 0.5)" }}>
      <div className="settings-row" style={{ borderTop: 0, paddingTop: 0 }}>
        <div>
          <h2>Payment needs attention</h2>
          <p>
            Your {PLAN_LABELS[plan]} subscription is {subscriptionStatus}. Paid features are temporarily limited until the outstanding payment succeeds.
          </p>
        </div>
        <span className="plan-pill">Payment issue</span>
      </div>

      <div className="status-message" style={{ marginBottom: 14 }}>
        {invoiceNumber ? `Outstanding invoice ${invoiceNumber}` : "The latest subscription invoice is still outstanding"}
        {formattedAmount ? ` · ${formattedAmount}` : ""}.
        {attemptCount && attemptCount > 0 ? ` Stripe has already attempted payment ${attemptCount} ${attemptCount === 1 ? "time" : "times"}.` : ""}
        {retryDate ? ` The next automatic retry is scheduled for ${retryDate}.` : " Stripe billing recovery can retry the saved payment method automatically."}
        {" "}You can also pay the same invoice now or update your payment method. GameSignal restores paid access automatically after Stripe confirms payment.
      </div>

      {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

      <div className="dashboard-actions">
        {hostedInvoiceUrl ? (
          <a className="btn btn-primary" href={hostedInvoiceUrl}>
            Pay now
          </a>
        ) : null}
        <button type="button" className="btn btn-ghost" disabled={portalBusy} onClick={openBillingPortal}>
          {portalBusy ? "Opening…" : "Update payment method"}
        </button>
      </div>
    </section>
  );
}
