import Link from "next/link";
import { redirect } from "next/navigation";
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
    .select("workspace_id, workspaces(name)")
    .eq("user_id", data.user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const [{ data: subscription }, { data: profile }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan, status, stripe_customer_id")
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
        <div className="settings-grid" style={{ marginBottom: 16 }}>
          <WorkspaceSettings
            userId={data.user.id}
            email={email}
            initialDisplayName={displayName}
            workspaceId={membership.workspace_id as string}
            initialWorkspaceName={workspaceName}
          />
        </div>
        <SettingsClient
          workspaceId={membership.workspace_id as string}
          currentPlan={normalizePlan(subscription?.plan)}
          subscriptionStatus={subscription?.status ?? "trialing"}
          hasStripeCustomer={Boolean(subscription?.stripe_customer_id)}
        />
      </main>
    </div>
  );
}
