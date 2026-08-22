import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { normalizePlan, PLAN_LIMITS } from "@/lib/plans";

export const dynamic = "force-dynamic";

type CreateGameBody = {
  title?: string;
  steamUrl?: string;
  aliases?: string;
  excludes?: string;
};

type GameSlotState = {
  active_games: number;
  cooldown_slots: number;
  allowed_slots: number;
  effective_used_slots: number;
  available_slots: number;
  next_slot_available_at: string | null;
};

function parseTerms(value: string | undefined) {
  return Array.from(new Set(
    (value ?? "").split(",").map((item) => item.trim()).filter(Boolean),
  )).slice(0, 20);
}

function cooldownResponse(state: GameSlotState | null) {
  const cooldownUntil = state?.next_slot_available_at ?? null;
  const headers: Record<string, string> = {};
  if (cooldownUntil) {
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(cooldownUntil).getTime() - Date.now()) / 1000));
    headers["Retry-After"] = String(retryAfterSeconds);
  }

  return NextResponse.json(
    {
      error: "A recently removed game slot is still cooling down. Removed active-game slots unlock 12 hours after deletion.",
      cooldownUntil,
    },
    { status: 429, headers },
  );
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as CreateGameBody;
  const title = body.title?.trim();
  const steamUrl = body.steamUrl?.trim() || null;
  const aliases = parseTerms(body.aliases);
  const excludes = parseTerms(body.excludes);

  if (!title || title.length > 180) {
    return NextResponse.json({ error: "Enter a valid game title." }, { status: 400 });
  }
  if ([...aliases, ...excludes].some((term) => term.length > 180)) {
    return NextResponse.json({ error: "Search phrases must be 180 characters or shorter." }, { status: 400 });
  }

  if (steamUrl) {
    try {
      const parsed = new URL(steamUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
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
  const admin = getSupabaseAdminClient();
  const [
    { data: subscription },
    { data: slotStateData, error: slotStateError },
  ] = await Promise.all([
    supabase.from("subscriptions").select("plan, status").eq("workspace_id", workspaceId).maybeSingle(),
    admin.rpc("workspace_game_slot_cooldown_state", { p_workspace_id: workspaceId }),
  ]);

  if (slotStateError) {
    return NextResponse.json({ error: "Could not verify available game slots." }, { status: 500 });
  }

  const slotState = ((slotStateData ?? [])[0] ?? null) as GameSlotState | null;
  const plan = subscription?.status === "active" || subscription?.status === "trialing"
    ? normalizePlan(subscription?.plan)
    : "free";

  if (plan === "free") {
    return NextResponse.json(
      { error: "Choose a paid plan before adding a game." },
      { status: 403 },
    );
  }

  const gameLimit = PLAN_LIMITS[plan].games;
  if (slotState && slotState.effective_used_slots >= gameLimit) {
    if (slotState.cooldown_slots > 0 && slotState.active_games < gameLimit) {
      return cooldownResponse(slotState);
    }

    return NextResponse.json(
      { error: `Your ${plan} plan supports up to ${gameLimit} active game(s). Pause a game or change plan to free a slot.` },
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
    const cooldownBlocked = error?.code === "P0001" && error.message.includes("GAME_SLOT_COOLDOWN");

    if (cooldownBlocked) {
      const { data: refreshedStateData } = await admin.rpc("workspace_game_slot_cooldown_state", {
        p_workspace_id: workspaceId,
      });
      const refreshedState = ((refreshedStateData ?? [])[0] ?? null) as GameSlotState | null;
      return cooldownResponse(refreshedState);
    }

    return NextResponse.json(
      { error: duplicate ? "This game is already tracked." : error?.message ?? "Could not create the game." },
      { status: duplicate ? 409 : 500 },
    );
  }

  const aliasRows = [
    ...aliases.filter((phrase) => phrase.toLocaleLowerCase() !== title.toLocaleLowerCase()).map((phrase) => ({ game_id: game.id, phrase, type: "include" as const })),
    ...excludes.map((phrase) => ({ game_id: game.id, phrase, type: "exclude" as const })),
  ];
  if (aliasRows.length) {
    await supabase.from("game_aliases").insert(aliasRows);
  }

  // Best effort. Missing platform secrets or quota should not undo game creation.
  await Promise.allSettled([
    supabase.functions.invoke("scan-twitch", { body: { game_id: game.id } }),
    supabase.functions.invoke("scan-youtube", { body: { game_id: game.id } }),
  ]);

  return NextResponse.json({ game }, { status: 201 });
}
