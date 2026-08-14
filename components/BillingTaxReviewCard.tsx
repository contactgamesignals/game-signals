"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PLAN_LABELS, type PlanName } from "@/lib/plans";

type Props = {
  workspaceId: string;
  plan: PlanName;
  reason: string | null;
};

function reviewMessage(reason: string | null) {
  if (reason === "cross_border_consumer_tax_route_not_live") {
    return "Your billing country is outside the currently supported Poland-only paid beta. Paid features stay locked while the transaction is reviewed.";
  }
  if (reason === "cross_border_company_vies_tax_review") {
    return "This company purchase needs cross-border VAT/VIES review before paid features can be activated.";
  }
  if (reason === "pl_vat_missing_on_paid_invoice") {
    return "The Polish invoice did not contain the VAT evidence expected by GameSignal, so paid access is locked for review.";
  }
  return "The payment exists, but GameSignal needs to verify the billing/tax route before paid features can be activated.";
}

export default function BillingTaxReviewCard({ workspaceId, plan, reason }: Props) {
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <h2>Billing review required</h2>
          <p>{reviewMessage(reason)}</p>
        </div>
        <span className="plan-pill">Access locked</span>
      </div>

      <div className="status-message" style={{ marginBottom: 14 }}>
        Stripe currently has a {PLAN_LABELS[plan]} subscription for this workspace. We do not create a second subscription while the existing billing record is under review. No paid monitoring entitlement is granted until the tax route is approved.
      </div>

      {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

      <div className="dashboard-actions">
        <button type="button" className="btn btn-ghost" disabled={portalBusy} onClick={openBillingPortal}>
          {portalBusy ? "Opening…" : "Manage billing"}
        </button>
      </div>
    </section>
  );
}
