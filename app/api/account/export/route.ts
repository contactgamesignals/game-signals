import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 400 });

  const workspaceId = membership?.workspace_id as string | undefined;
  const [profileResult, workspaceResult, subscriptionResult, gamesResult, channelsResult] = await Promise.all([
    supabase.from("profiles").select("id, display_name, created_at, updated_at").eq("id", user.id).maybeSingle(),
    workspaceId
      ? supabase.from("workspaces").select("id, name, created_at, updated_at").eq("id", workspaceId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    workspaceId
      ? supabase.from("subscriptions").select("plan, status, current_period_end, cancel_at_period_end, created_at, updated_at").eq("workspace_id", workspaceId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    workspaceId
      ? supabase.from("games").select("id, title, steam_url, enabled, twitch_game_id, created_at, updated_at").eq("workspace_id", workspaceId).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    workspaceId
      ? supabase.from("notification_channels").select("id, type, enabled, minimum_signal_score, minimum_live_viewers, created_at, updated_at").eq("workspace_id", workspaceId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError = profileResult.error || workspaceResult.error || subscriptionResult.error || gamesResult.error || channelsResult.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 400 });

  const games = gamesResult.data ?? [];
  const gameIds = games.map((game) => game.id);
  const [aliasesResult, mentionsResult, scansResult] = gameIds.length
    ? await Promise.all([
        supabase.from("game_aliases").select("game_id, phrase, type, created_at").in("game_id", gameIds).order("created_at"),
        supabase.from("mentions").select("id, game_id, platform, creator_name, title, url, viewer_count, view_count, language, published_at, detected_at, last_seen_at, signal_score").in("game_id", gameIds).order("detected_at", { ascending: false }),
        supabase.from("scan_runs").select("id, game_id, platform, started_at, finished_at, status, results_count, error").in("game_id", gameIds).order("started_at", { ascending: false }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  const detailError = aliasesResult.error || mentionsResult.error || scansResult.error;
  if (detailError) return NextResponse.json({ error: detailError.message }, { status: 400 });

  const exportedAt = new Date().toISOString();
  const payload = {
    exported_at: exportedAt,
    account: {
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
      profile: profileResult.data,
    },
    workspace: workspaceResult.data
      ? {
          ...workspaceResult.data,
          membership_role: membership?.role ?? null,
        }
      : null,
    subscription: subscriptionResult.data,
    games,
    game_aliases: aliasesResult.data ?? [],
    mentions: mentionsResult.data ?? [],
    scan_runs: scansResult.data ?? [],
    notification_channels: channelsResult.data ?? [],
    omitted_for_security: [
      "Discord webhook destinations",
      "Stripe customer/subscription identifiers",
      "API keys and server-side secrets",
      "raw provider payloads",
    ],
  };

  const date = exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="gamesignal-account-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
