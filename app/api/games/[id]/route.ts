import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { normalizePlan, PLAN_LIMITS } from "@/lib/plans";

const GAME_SELECT = "id, title, steam_url, enabled, twitch_game_id, youtube_last_scanned_at, twitch_last_scanned_at, created_at";
const GAME_SLOT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

type GameSlotState = {
  active_games: number;
  cooldown_slots: number;
  allowed_slots: number;
  effective_used_slots: number;
  available_slots: number;
  next_slot_available_at: string | null;
};

function parseTerms(value: unknown) {
  if (typeof value !== "string") return [];
  return Array.from(new Set(
    value.split(",").map((item) => item.trim()).filter(Boolean),
  )).slice(0, 20);
}

function validHttpUrl(value: string | null) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const [{ data: game, error: gameError }, { data: aliases, error: aliasesError }] = await Promise.all([
    supabase.from("games").select(GAME_SELECT).eq("id", id).maybeSingle(),
    supabase.from("game_aliases").select("phrase, type").eq("game_id", id).order("created_at"),
  ]);

  if (gameError || aliasesError) {
    return NextResponse.json({ error: gameError?.message ?? aliasesError?.message ?? "Could not load monitor." }, { status: 400 });
  }
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  const include = (aliases ?? [])
    .filter((item) => item.type === "include" && item.phrase.toLocaleLowerCase() !== game.title.toLocaleLowerCase())
    .map((item) => item.phrase);
  const exclude = (aliases ?? []).filter((item) => item.type === "exclude").map((item) => item.phrase);

  return NextResponse.json({ game, aliases: include, excludes: exclude });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    enabled?: unknown;
    title?: unknown;
    steamUrl?: unknown;
    aliases?: unknown;
    excludes?: unknown;
  };

  const { id } = await context.params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  if (typeof body.title !== "string") {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "No supported update was provided." }, { status: 400 });
    }

    let targetWorkspaceId: string | null = null;

    if (body.enabled) {
      const { data: targetGame, error: targetGameError } = await supabase
        .from("games")
        .select("id, workspace_id, enabled")
        .eq("id", id)
        .maybeSingle();
      if (targetGameError) return NextResponse.json({ error: targetGameError.message }, { status: 400 });
      if (!targetGame) return NextResponse.json({ error: "Game not found." }, { status: 404 });

      targetWorkspaceId = targetGame.workspace_id as string;
      const [
        { data: subscription },
        { data: slotStateData, error: slotStateError },
      ] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("plan, status")
          .eq("workspace_id", targetWorkspaceId)
          .maybeSingle(),
        supabase.rpc("workspace_game_slot_cooldown_state", { p_workspace_id: targetWorkspaceId }),
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
          { error: "Choose a paid plan before resuming game monitoring." },
          { status: 403 },
        );
      }

      const gameLimit = PLAN_LIMITS[plan].games;
      if (!targetGame.enabled && slotState && slotState.effective_used_slots >= gameLimit) {
        if (slotState.cooldown_slots > 0 && slotState.active_games < gameLimit) {
          return cooldownResponse(slotState);
        }

        return NextResponse.json(
          { error: `Your ${plan} plan already uses all ${gameLimit} active game slot(s). Pause another game or change plan first.` },
          { status: 403 },
        );
      }
    }

    const { data: game, error } = await supabase
      .from("games")
      .update({ enabled: body.enabled })
      .eq("id", id)
      .select(GAME_SELECT)
      .maybeSingle();

    if (error) {
      const cooldownBlocked = error.code === "P0001" && error.message.includes("GAME_SLOT_COOLDOWN");
      if (cooldownBlocked && targetWorkspaceId) {
        const { data: refreshedStateData } = await supabase.rpc("workspace_game_slot_cooldown_state", {
          p_workspace_id: targetWorkspaceId,
        });
        const refreshedState = ((refreshedStateData ?? [])[0] ?? null) as GameSlotState | null;
        return cooldownResponse(refreshedState);
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });
    return NextResponse.json({ game });
  }

  const title = body.title.trim();
  const steamUrl = typeof body.steamUrl === "string" ? body.steamUrl.trim() || null : null;
  const includes = parseTerms(body.aliases);
  const excludes = parseTerms(body.excludes);

  if (!title || title.length > 180) {
    return NextResponse.json({ error: "Enter a valid game title." }, { status: 400 });
  }
  if (!validHttpUrl(steamUrl)) {
    return NextResponse.json({ error: "Enter a valid Steam or official game URL." }, { status: 400 });
  }
  if ([...includes, ...excludes].some((term) => term.length > 180)) {
    return NextResponse.json({ error: "Search phrases must be 180 characters or shorter." }, { status: 400 });
  }

  const { data: existing } = await supabase.from("games").select("title").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  const titleChanged = existing.title !== title;
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    title,
    steam_url: steamUrl,
    youtube_next_scan_at: now,
    twitch_next_scan_at: now,
  };
  if (titleChanged) {
    update.twitch_game_id = null;
    update.youtube_last_scanned_at = null;
    update.twitch_last_scanned_at = null;
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .update(update)
    .eq("id", id)
    .select(GAME_SELECT)
    .maybeSingle();

  if (gameError) {
    const duplicate = gameError.code === "23505";
    return NextResponse.json({ error: duplicate ? "This game title is already tracked." : gameError.message }, { status: duplicate ? 409 : 400 });
  }
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  const { error: deleteAliasesError } = await supabase.from("game_aliases").delete().eq("game_id", id);
  if (deleteAliasesError) return NextResponse.json({ error: deleteAliasesError.message }, { status: 400 });

  const aliasRows = [
    ...includes.filter((phrase) => phrase.toLocaleLowerCase() !== title.toLocaleLowerCase()).map((phrase) => ({ game_id: id, phrase, type: "include" as const })),
    ...excludes.map((phrase) => ({ game_id: id, phrase, type: "exclude" as const })),
  ];
  if (aliasRows.length) {
    const { error: aliasError } = await supabase.from("game_aliases").insert(aliasRows);
    if (aliasError) return NextResponse.json({ error: aliasError.message }, { status: 400 });
  }

  return NextResponse.json({ game, aliases: includes, excludes });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: deletedGame, error } = await supabase
    .from("games")
    .delete()
    .eq("id", id)
    .select("id, workspace_id, title, enabled")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!deletedGame) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  const cooldownCreated = Boolean(deletedGame.enabled);
  const cooldownUntil = cooldownCreated
    ? new Date(Date.now() + GAME_SLOT_COOLDOWN_MS).toISOString()
    : null;

  let slotState: GameSlotState | null = null;
  if (cooldownCreated) {
    const { data: slotStateData } = await supabase.rpc("workspace_game_slot_cooldown_state", {
      p_workspace_id: deletedGame.workspace_id,
    });
    slotState = ((slotStateData ?? [])[0] ?? null) as GameSlotState | null;
  }

  return NextResponse.json({
    ok: true,
    cooldownCreated,
    cooldownUntil,
    nextSlotAvailableAt: slotState?.next_slot_available_at ?? null,
    availableSlots: slotState?.available_slots ?? null,
  });
}
