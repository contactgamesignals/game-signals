import Link from "next/link";
import { redirect } from "next/navigation";
import BillingRecoveryCard from "@/components/BillingRecoveryCard";
import SettingsClient from "@/components/SettingsClient";
import WorkspaceSettings from "@/components/WorkspaceSettings";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { normalizePlan } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) redirect("/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const [{ data: subscription }, { data: profile }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, stripe_customer_id, stripe_subscription_id")
      .eq("workspace_id", membership.workspace_id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", data.user.id)
      .maybeSingle(),
  ]);

  const workspaceValue = Array.isArray(membership.workspaces)
    ? membership.workspaces[0]
    : membership.workspaces;
  const workspaceName = (workspaceValue?.name as string | undefined) ?? "My workspace";
  const email = data.user.email ?? "";
  const displayName = profile?.display_name ?? email.split("@")[0] ?? "Account";
  const canManageBilling = membership.role === "owner" || membership.role === "admin";
  const subscriptionStatus = subscription?.status ?? "trialing";
  const paymentNeedsAttention = subscriptionStatus === "past_due" || subscriptionStatus === "incomplete";

  let recoveryInvoice: {
    invoice_number: string | null;
    amount_remaining: number | null;
    currency: string | null;
    hosted_invoice_url: string | null;
    attempt_count: number | null;
    next_payment_attempt: string | null;
  } | null = null;

  if (canManageBilling && paymentNeedsAttention) {
    const { data: invoice } = await supabase
      .from("billing_invoice_records")
      .select("invoice_number, amount_remaining, currency, hosted_invoice_url, attempt_count, next_payment_attempt")
      .eq("workspace_id", membership.workspace_id)
      .eq("stripe_status", "open")
      .gt("amount_remaining", 0)
      .order("invoice_created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    recoveryInvoice = invoice ?? null;
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link href="/dashboard" className="brand"><span className="brand-mark" /><span>GameSignal</span></Link>
        <div className="app-topbar-right">{email}</div>
      </header>
      <main className="dashboard-main" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div className="dashboard-head">
          <div><div className="kicker">Workspace</div><h1>Settings</h1><p>Workspace, notification, billing, and integration configuration.</p></div>
          <Link href="/dashboard" className="btn btn-ghost">← Dashboard</Link>
        </div>
        {canManageBilling && paymentNeedsAttention ? (
          <div className="settings-grid" style={{ marginBottom: 16 }}>
            <BillingRecoveryCard
              workspaceId={membership.workspace_id as string}
              plan={normalizePlan(subscription?.plan)}
              subscriptionStatus={subscriptionStatus}
              hostedInvoiceUrl={recoveryInvoice?.hosted_invoice_url ?? null}
              invoiceNumber={recoveryInvoice?.invoice_number ?? null}
              amountRemaining={recoveryInvoice?.amount_remaining ?? null}
              currency={recoveryInvoice?.currency ?? null}
              attemptCount={recoveryInvoice?.attempt_count ?? null}
              nextPaymentAttempt={recoveryInvoice?.next_payment_attempt ?? null}
            />
          </div>
        ) : null}
        <div className="settings-grid" style={{ marginBottom: 16 }}>
          <WorkspaceSettings
            userId={data.user.id}
            email={email}
            initialDisplayName={displayName}
            workspaceId={membership.workspace_id as string}
            initialWorkspaceName={workspaceName}
            canManageBilling={canManageBilling}
          />
        </div>
        {!paymentNeedsAttention ? (
          <SettingsClient
            workspaceId={membership.workspace_id as string}
            currentPlan={normalizePlan(subscription?.plan)}
            subscriptionStatus={subscriptionStatus}
            hasStripeCustomer={Boolean(subscription?.stripe_customer_id)}
          />
        ) : null}
      </main>
    </div>
  );
}
