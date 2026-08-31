import Link from "next/link";
import { redirect } from "next/navigation";

import { BRAND } from "@/lib/brand";
import { isGameSignalOperator } from "@/lib/operator-access";
import { readProductFunnelSnapshot } from "@/lib/product-funnel";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RangeKey = "24h" | "7d" | "30d" | "all";
type PageProps = {
  searchParams: Promise<{ range?: string | string[] }>;
};

const RANGES: Array<{ key: RangeKey; label: string; hours: number | null }> = [
  { key: "24h", label: "24 hours", hours: 24 },
  { key: "7d", label: "7 days", hours: 7 * 24 },
  { key: "30d", label: "30 days", hours: 30 * 24 },
  { key: "all", label: "All time", hours: null },
];

function rangeKey(value: string | string[] | undefined): RangeKey {
  const candidate = Array.isArray(value) ? value[0] : value;
  return RANGES.some((range) => range.key === candidate) ? candidate as RangeKey : "7d";
}

function percent(value: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export default async function ProductAnalyticsPage({ searchParams }: PageProps) {
  if (!isSupabaseConfigured()) redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (!isGameSignalOperator(data.user.id)) redirect("/dashboard");

  const params = await searchParams;
  const selectedRange = rangeKey(params.range);
  const range = RANGES.find((item) => item.key === selectedRange) ?? RANGES[1];
  const snapshot = await readProductFunnelSnapshot(range.hours);

  const stages = [
    { label: "Signups", value: snapshot.signups, note: "Accounts created" },
    { label: "Added game", value: snapshot.addedGame, note: percent(snapshot.addedGame, snapshot.signups) },
    { label: "Trial redeemed", value: snapshot.trialRedeemed, note: percent(snapshot.trialRedeemed, snapshot.signups) },
    { label: "Discord now", value: snapshot.discordConnectedCurrent, note: percent(snapshot.discordConnectedCurrent, snapshot.signups) },
    { label: "Checkout started", value: snapshot.checkoutStarted, note: percent(snapshot.checkoutStarted, snapshot.signups) },
    { label: "Paid", value: snapshot.purchaseCompleted, note: percent(snapshot.purchaseCompleted, snapshot.signups) },
  ];

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link href="/dashboard" className="brand"><span className="brand-mark" /><span>{BRAND.name}</span></Link>
        <div className="app-topbar-right">Operator analytics</div>
      </header>

      <main className="dashboard-main" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div className="dashboard-head">
          <div>
            <div className="kicker">Operator only</div>
            <h1>Product funnel</h1>
            <p>Launch conversion from new accounts to real Paddle LIVE subscriptions.</p>
          </div>
          <Link href="/dashboard" className="btn btn-ghost">Back to dashboard</Link>
        </div>

        <section className="dashboard-panel" style={{ marginBottom: 18 }}>
          <div className="dashboard-panel-head">
            <div>
              <div className="panel-title">Cohort</div>
              <h2>{range.label}</h2>
              <span className="tiny">Users are grouped by account creation time. Their later actions are then counted for the same cohort.</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {RANGES.map((option) => (
                <Link
                  key={option.key}
                  href={`/dashboard/analytics?range=${option.key}`}
                  className={`btn ${selectedRange === option.key ? "btn-primary" : "btn-ghost"}`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="dashboard-panel" style={{ marginBottom: 18 }}>
          <div className="dashboard-panel-head">
            <div>
              <div className="panel-title">Website traffic</div>
              <h2>Visitors and pageviews</h2>
              <span className="tiny">Vercel Web Analytics is already collecting the top of the funnel. No duplicate visitor tracker or extra cookies were added.</span>
            </div>
            <a
              className="btn btn-ghost"
              href="https://vercel.com/contactgamesignals-2036s-projects/game-signals/analytics"
              target="_blank"
              rel="noreferrer"
            >
              Open Vercel Analytics
            </a>
          </div>
        </section>

        <section className="dashboard-panel" style={{ marginBottom: 18 }}>
          <div className="dashboard-panel-head">
            <div>
              <div className="panel-title">Conversion</div>
              <h2>Signup to paid</h2>
              <span className="tiny">Percentages below are measured against signups in the selected cohort. Trial is optional, so the stages do not have to decrease in order.</span>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12 }}>
              {stages.map((stage) => (
                <div key={stage.label} className="settings-card" style={{ padding: 18 }}>
                  <span className="tiny">{stage.label}</span>
                  <div style={{ fontSize: 32, fontWeight: 800, marginTop: 6 }}>{stage.value}</div>
                  <span className="tiny">{stage.note}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="dashboard-panel" style={{ marginBottom: 18 }}>
          <div className="dashboard-panel-head">
            <div>
              <div className="panel-title">Influencer codes</div>
              <h2>Trial attribution</h2>
              <span className="tiny">A purchase is attributed when the workspace that redeemed a code later receives a Paddle LIVE subscription.</span>
            </div>
          </div>
          <div className="dashboard-panel-body" style={{ overflowX: "auto" }}>
            {snapshot.trialAttribution.length ? (
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                <thead>
                  <tr style={{ textAlign: "left" }}>
                    <th style={{ padding: "10px 12px" }}>Code</th>
                    <th style={{ padding: "10px 12px" }}>Assigned to</th>
                    <th style={{ padding: "10px 12px" }}>Redeemed</th>
                    <th style={{ padding: "10px 12px" }}>Paid</th>
                    <th style={{ padding: "10px 12px" }}>Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.trialAttribution.map((row) => (
                    <tr key={row.code} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 12px" }}><strong>{row.code}</strong></td>
                      <td style={{ padding: "10px 12px" }}>{row.assignedTo ?? row.label ?? "Unassigned"}</td>
                      <td style={{ padding: "10px 12px" }}>{row.redemptions}</td>
                      <td style={{ padding: "10px 12px" }}>{row.purchases}</td>
                      <td style={{ padding: "10px 12px" }}>{percent(row.purchases, row.redemptions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="tiny" style={{ margin: 0 }}>No trial-code redemptions in this signup cohort yet.</p>
            )}
          </div>
        </section>

        <p className="tiny" style={{ marginBottom: 24 }}>
          Discord is a current-state metric because disconnecting removes the saved channel. Checkout means a Paddle checkout transaction was created. Paid means a Paddle LIVE subscription ID exists. No customer email, Discord webhook, or billing identifier is shown here.
        </p>
      </main>
    </div>
  );
}
