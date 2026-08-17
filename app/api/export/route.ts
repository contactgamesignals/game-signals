import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isPaidPlan } from "@/lib/plans";

export const dynamic = "force-dynamic";

function safeCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  // Prevent spreadsheet applications from evaluating exported user/platform text as formulas.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", authData.user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  const workspaceId = membership.workspace_id as string;
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const active = subscription?.status === "active" || subscription?.status === "trialing";
  if (!active || !isPaidPlan(subscription?.plan)) {
    return NextResponse.json({ error: "CSV export requires an active paid plan." }, { status: 403 });
  }

  const { data: gamesData } = await supabase
    .from("games")
    .select("id, title")
    .eq("workspace_id", workspaceId);
  const games = gamesData ?? [];
  const gameIds = games.map((game) => game.id as string);
  const gameTitles = new Map(games.map((game) => [game.id as string, game.title as string]));

  const headers = [
    "detected_at",
    "game",
    "platform",
    "creator",
    "title",
    "url",
    "viewer_count",
    "view_count",
    "signal_score",
  ];

  let rows: string[] = [];
  if (gameIds.length) {
    const { data: mentions, error } = await supabase
      .from("mentions")
      .select("game_id, detected_at, platform, creator_name, title, url, viewer_count, view_count, signal_score")
      .in("game_id", gameIds)
      .order("detected_at", { ascending: false })
      .limit(10000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    rows = (mentions ?? []).map((mention) => [
      mention.detected_at,
      gameTitles.get(mention.game_id as string) ?? "",
      mention.platform,
      mention.creator_name,
      mention.title,
      mention.url,
      mention.viewer_count,
      mention.view_count,
      mention.signal_score,
    ].map(safeCell).join(","));
  }

  const csv = `\uFEFF${headers.map(safeCell).join(",")}\r\n${rows.join("\r\n")}`;
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="who-plays-my-game-signals-${date}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
