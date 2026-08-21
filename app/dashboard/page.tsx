import { redirect } from "next/navigation";
import DashboardClient from "@/components/DashboardClient";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { normalizePlan } from "@/lib/plans";
import type { DashboardGame, DashboardMention } from "@/lib/types";

export const dynamic = "force-dynamic";

type DashboardStatsRow = {
  signal_count: number | string | null;
  live_now_count: number | string | null;
  creator_count: number | string | null;
  total_reach: number | string | null;
};

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="app-shell" style={{ padding: 24 }}>
        <section className="setup-card">
          <div className="kicker">Setup required</div>
          <h1>Connect Supabase</h1>
          <p className="setup-list">
            Copy <code>.env.example</code> to <code>.env.local</code>, add the project URL and publishable key,
            then apply the SQL migration from <code>supabase/migrations</code>.
          </p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const { data: membershipData, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(id, name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membershipData) {
    return (
      <main className="app-shell" style={{ padding: 24 }}>
        <section className="setup-card">
          <div className="kicker">Workspace error</div>
          <h1>No workspace found</h1>
          <p className="setup-list">Reapply the database migration so the new-user trigger can create the default workspace.</p>
        </section>
      </main>
    );
  }

  const workspaceValue = Array.isArray(membershipData.workspaces)
    ? membershipData.workspaces[0]
    : membershipData.workspaces;
  const workspaceId = membershipData.workspace_id as string;
  const workspaceName = (workspaceValue?.name as string | undefined) ?? "My studio";

  const [
    { data: gamesData },
    { data: subscriptionData },
    { data: mentionsData },
    { data: statsData },
  ] = await Promise.all([
    supabase
      .from("games")
      .select("id, title, steam_url, enabled, twitch_game_id, youtube_last_scanned_at, twitch_last_scanned_at, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("subscriptions")
      .select("plan, status")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("mentions")
      .select("id, game_id, platform, creator_name, title, url, thumbnail_url, viewer_count, view_count, published_at, detected_at, last_seen_at, signal_score, games!inner(title, workspace_id)")
      .eq("games.workspace_id", workspaceId)
      .order("detected_at", { ascending: false })
      .limit(100),
    supabase.rpc("dashboard_signal_stats", { p_workspace_id: workspaceId }),
  ]);

  const games = (gamesData ?? []) as DashboardGame[];
  const mentions = (mentionsData ?? []) as DashboardMention[];
  const statsRow = ((statsData ?? [])[0] ?? null) as DashboardStatsRow | null;
  const fallbackCreators = new Set(mentions.map((mention) => mention.creator_name.toLowerCase())).size;
  const fallbackReach = mentions.reduce(
    (total, mention) => total + (mention.view_count ?? mention.viewer_count ?? 0),
    0,
  );

  const initialStats = {
    signalCount: Number(statsRow?.signal_count ?? mentions.length),
    liveNowCount: Number(statsRow?.live_now_count ?? 0),
    creatorCount: Number(statsRow?.creator_count ?? fallbackCreators),
    totalReach: Number(statsRow?.total_reach ?? fallbackReach),
  };

  return (
    <DashboardClient
      email={user.email ?? "Account"}
      workspaceName={workspaceName}
      workspaceId={workspaceId}
      plan={subscriptionData?.status === "active" || subscriptionData?.status === "trialing"
        ? normalizePlan(subscriptionData?.plan)
        : "free"}
      initialGames={games}
      initialMentions={mentions}
      initialStats={initialStats}
    />
  );
}
