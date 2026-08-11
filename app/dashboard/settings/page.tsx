import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) redirect("/dashboard");
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link href="/" className="brand"><span className="brand-mark" /><span>GameSignal</span></Link>
        <div className="app-topbar-right">{data.user.email}</div>
      </header>
      <main className="dashboard-main" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div className="dashboard-head">
          <div><div className="kicker">Workspace</div><h1>Settings</h1><p>Notification and integration configuration.</p></div>
          <Link href="/dashboard" className="btn btn-ghost">← Dashboard</Link>
        </div>
        <div className="settings-grid">
          <section className="settings-card">
            <h2>Email alerts</h2>
            <p>Transactional email delivery is prepared for a later worker. Keep alerts disabled until a provider and sending domain are configured.</p>
            <div className="settings-row"><span>Status</span><span className="plan-pill">Not configured</span></div>
          </section>
          <section className="settings-card">
            <h2>Discord webhook</h2>
            <p>The database and notification worker support Discord. Add webhook management through a server route before production use.</p>
            <div className="settings-row"><span>Status</span><span className="plan-pill">Backend ready</span></div>
          </section>
          <section className="settings-card">
            <h2>Billing</h2>
            <p>Stripe Checkout and Billing belong to the next production stage after monitoring is proven with real platform data.</p>
            <div className="settings-row"><span>Current plan</span><span className="plan-pill">Free setup</span></div>
          </section>
          <section className="settings-card">
            <h2>Platform health</h2>
            <p>Use Supabase Function logs and the scan_runs table to inspect API errors, quotas, and worker execution times.</p>
            <div className="settings-row"><span>Logs</span><code>scan_runs</code></div>
          </section>
        </div>
      </main>
    </div>
  );
}
