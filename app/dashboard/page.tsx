import { redirect } from "next/navigation";
import DashboardClient from "@/components/DashboardClient";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { normalizePlan } from "@/lib/plans";
import type { DashboardGame, DashboardMention } from "@/lib/types";

export const dynamic = "force-dynamic";

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

  // These reads no longer wait on each other. Mentions are scoped through the
  // games relationship, so games, subscription and mentions can load in one
  // parallel round instead of waiting for the game IDs first.
  const [{ data: gamesData }, { data: subscriptionData }, { data: mentionsData }] = await Promise.all([
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
  ]);

  const games = (gamesData ?? []) as DashboardGame[];
  const mentions = (mentionsData ?? []) as DashboardMention[];

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
    />
  );
}
