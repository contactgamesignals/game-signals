import Link from "next/link";
import { redirect } from "next/navigation";
import SettingsClient from "@/components/SettingsClient";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { normalizePlan } from "@/lib/plans";
import { isStripeServerConfigured, isStripeWebhookConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) redirect("/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, stripe_customer_id")
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link href="/" className="brand"><span className="brand-mark" /><span>GameSignal</span></Link>
        <div className="app-topbar-right">{data.user.email}</div>
      </header>
      <main className="dashboard-main" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div className="dashboard-head">
          <div><div className="kicker">Workspace</div><h1>Settings</h1><p>Notification, billing, and integration configuration.</p></div>
          <Link href="/dashboard" className="btn btn-ghost">← Dashboard</Link>
        </div>
        <SettingsClient
          workspaceId={membership.workspace_id as string}
          currentPlan={normalizePlan(subscription?.plan)}
          subscriptionStatus={subscription?.status ?? "trialing"}
          billingConfigured={isStripeServerConfigured() && isStripeWebhookConfigured()}
          hasStripeCustomer={Boolean(subscription?.stripe_customer_id)}
        />
      </main>
    </div>
  );
}
