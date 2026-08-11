import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { normalizePlan, PLAN_LIMITS } from "@/lib/plans";

export const dynamic = "force-dynamic";

type CreateGameBody = {
  title?: string;
  steamUrl?: string;
  aliases?: string;
};

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateGameBody;
  const title = body.title?.trim();
  const steamUrl = body.steamUrl?.trim() || null;
  const aliases = (body.aliases ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (!title || title.length > 180) {
    return NextResponse.json({ error: "Enter a valid game title." }, { status: 400 });
  }

  if (steamUrl) {
    try {
      const parsed = new URL(steamUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("Invalid protocol");
    } catch {
      return NextResponse.json({ error: "Enter a valid Steam or game URL." }, { status: 400 });
    }
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "No workspace found." }, { status: 409 });
  }

  const workspaceId = membership.workspace_id as string;
  const [{ count }, { data: subscription }] = await Promise.all([
    supabase.from("games").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase.from("subscriptions").select("plan, status").eq("workspace_id", workspaceId).maybeSingle(),
  ]);

  const plan = subscription?.status === "active" || subscription?.status === "trialing"
    ? normalizePlan(subscription?.plan)
    : "free";
  if ((count ?? 0) >= PLAN_LIMITS[plan].games) {
    return NextResponse.json(
      { error: `The ${plan} plan supports up to ${PLAN_LIMITS[plan].games} tracked game(s).` },
      { status: 403 },
    );
  }

  const { data: game, error } = await supabase
    .from("games")
    .insert({ workspace_id: workspaceId, title, steam_url: steamUrl })
    .select("id, title, steam_url, enabled, twitch_game_id, youtube_last_scanned_at, twitch_last_scanned_at, created_at")
    .single();

  if (error || !game) {
    const duplicate = error?.code === "23505";
    return NextResponse.json(
      { error: duplicate ? "This game is already tracked." : error?.message ?? "Could not create the game." },
      { status: duplicate ? 409 : 500 },
    );
  }

  const uniqueAliases = Array.from(new Set([title, ...aliases]));
  if (uniqueAliases.length) {
    await supabase.from("game_aliases").insert(
      uniqueAliases.map((phrase) => ({ game_id: game.id, phrase, type: "include" })),
    );
  }

  // Best effort. Missing platform secrets should not undo game creation.
  await Promise.allSettled([
    supabase.functions.invoke("scan-twitch", { body: { game_id: game.id } }),
    supabase.functions.invoke("scan-youtube", { body: { game_id: game.id } }),
  ]);

  return NextResponse.json({ game }, { status: 201 });
}
