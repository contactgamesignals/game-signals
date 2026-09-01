import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DASHBOARD_URL = "https://www.whoplaysmygame.com/dashboard";

type GameChannel = {
  game_id: string;
  enabled: boolean;
  minimum_live_viewers: number;
  destination: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function validDiscordWebhook(value: string) {
  try {
    const url = new URL(value);
    const allowedHosts = new Set(["discord.com", "www.discord.com", "discordapp.com", "www.discordapp.com"]);
    return url.protocol === "https:" && allowedHosts.has(url.hostname) && url.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

function missingGameChannelTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "42P01" || candidate.code === "PGRST205" || String(candidate.message ?? "").includes("game_discord_channels");
}

function buildTestEmbed(gameTitle = "Your game") {
  const now = new Date();
  const unix = Math.floor(now.getTime() / 1000);
  const safeGameTitle = gameTitle.trim().slice(0, 120) || "Your game";

  return {
    author: {
      name: "Who Plays My Game · Twitch alert",
      url: DASHBOARD_URL,
    },
    title: "🟣 ExampleCreator is LIVE on Twitch",
    description: `**${safeGameTitle} - test stream**\n\n**ExampleCreator** just went live with **${safeGameTitle}**.\n\n✅ *This game's Discord webhook is connected. This is a preview of real creator alerts.*`,
    url: DASHBOARD_URL,
    color: 0x9146ff,
    fields: [
      { name: "🎮 Game", value: `**${safeGameTitle}**`, inline: true },
      { name: "👤 Creator", value: "**ExampleCreator**", inline: true },
      { name: "👥 Live viewers", value: "**184**", inline: true },
      { name: "🕒 Detected", value: `<t:${unix}:R>`, inline: true },
      { name: "🔗 Quick links", value: `[Open dashboard](${DASHBOARD_URL})`, inline: false },
    ],
    footer: { text: "Who Plays My Game • Twitch creator monitoring • Test alert" },
    timestamp: now.toISOString(),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = request.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !serviceKey || !authHeader) return json({ error: "Unauthorized." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Unauthorized." }, 401);

    const body = await request.json().catch(() => ({})) as {
      action?: "status" | "upsert" | "delete" | "test";
      workspace_id?: string;
      game_id?: string;
      webhook_url?: string;
      minimum_signal_score?: number;
      minimum_live_viewers?: number;
    };
    if (!body.workspace_id || !body.action) return json({ error: "Missing workspace or action." }, 400);

    const { data: membership, error: membershipError } = await userClient
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", body.workspace_id)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (membershipError || !membership) return json({ error: "Forbidden." }, 403);

    const { data: access, error: accessError } = await userClient
      .rpc("workspace_product_access", { p_workspace_id: body.workspace_id })
      .maybeSingle();
    if (accessError) throw accessError;

    const plan = String(access?.effective_plan ?? "free");
    const accessKind = String(access?.access_kind ?? "none");
    const allowed = plan === "indie" || plan === "studio" || plan === "publisher" || plan === "crazy";

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: existing, error: channelError } = await service
      .from("notification_channels")
      .select("id, enabled, minimum_signal_score, minimum_live_viewers, destination")
      .eq("workspace_id", body.workspace_id)
      .eq("type", "discord")
      .limit(1)
      .maybeSingle();
    if (channelError) throw channelError;

    const gameChannelsResult = await service
      .from("game_discord_channels")
      .select("game_id, enabled, minimum_live_viewers, destination")
      .eq("workspace_id", body.workspace_id);

    let perGameAvailable = true;
    let gameChannels = (gameChannelsResult.data ?? []) as GameChannel[];
    if (gameChannelsResult.error) {
      if (!missingGameChannelTable(gameChannelsResult.error)) throw gameChannelsResult.error;
      perGameAvailable = false;
      gameChannels = [];
    }

    const requestedGameChannel = body.game_id
      ? gameChannels.find((channel) => channel.game_id === body.game_id) ?? null
      : null;

    if (body.action === "status") {
      return json({
        configured: body.game_id ? Boolean(requestedGameChannel) : Boolean(existing),
        enabled: body.game_id ? requestedGameChannel?.enabled ?? false : existing?.enabled ?? false,
        minimum_signal_score: 0,
        minimum_live_viewers: body.game_id ? requestedGameChannel?.minimum_live_viewers ?? 0 : existing?.minimum_live_viewers ?? 0,
        allowed,
        plan,
        access_kind: accessKind,
        per_game_available: perGameAvailable,
        channels: perGameAvailable
          ? gameChannels.map((channel) => ({
              game_id: channel.game_id,
              enabled: channel.enabled,
              minimum_live_viewers: channel.minimum_live_viewers,
            }))
          : [],
      });
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      return json({ error: "Only workspace owners and admins can change Discord settings." }, 403);
    }

    let game: { id: string; title: string } | null = null;
    if (body.game_id) {
      if (!perGameAvailable) return json({ error: "Per-game Discord settings are not available yet." }, 409);
      const { data: gameRow, error: gameError } = await service
        .from("games")
        .select("id, title")
        .eq("id", body.game_id)
        .eq("workspace_id", body.workspace_id)
        .maybeSingle();
      if (gameError) throw gameError;
      if (!gameRow) return json({ error: "Game not found in this workspace." }, 404);
      game = gameRow as { id: string; title: string };
    }

    if (body.action === "delete") {
      if (body.game_id) {
        const { error: deleteError } = await service
          .from("game_discord_channels")
          .delete()
          .eq("workspace_id", body.workspace_id)
          .eq("game_id", body.game_id);
        if (deleteError) throw deleteError;

        const { count, error: countError } = await service
          .from("game_discord_channels")
          .select("game_id", { count: "exact", head: true })
          .eq("workspace_id", body.workspace_id);
        if (countError) throw countError;

        if ((count ?? 0) === 0 && existing) {
          const { error: parentDeleteError } = await service.from("notification_channels").delete().eq("id", existing.id);
          if (parentDeleteError) throw parentDeleteError;
        }
      } else {
        if (perGameAvailable) {
          const { error: childrenDeleteError } = await service
            .from("game_discord_channels")
            .delete()
            .eq("workspace_id", body.workspace_id);
          if (childrenDeleteError) throw childrenDeleteError;
        }
        if (existing) {
          const { error } = await service.from("notification_channels").delete().eq("id", existing.id);
          if (error) throw error;
        }
      }
      return json({ ok: true, configured: false, allowed, plan, access_kind: accessKind });
    }

    if (!allowed) {
      return json({ error: "Discord alerts require an active paid plan or promotional trial." }, 403);
    }

    if (body.action === "test") {
      const destination = body.game_id ? requestedGameChannel?.destination : existing?.destination;
      if (!destination) return json({ error: "Configure a Discord webhook first." }, 409);
      const response = await fetch(destination, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Who Plays My Game",
          allowed_mentions: { parse: [] },
          embeds: [buildTestEmbed(game?.title)],
        }),
      });
      if (!response.ok) return json({ error: `Discord rejected the webhook (${response.status}).` }, 400);
      return json({ ok: true });
    }

    const webhook = body.webhook_url?.trim() ?? "";
    const minimumLiveViewers = Math.max(0, Math.round(Number(body.minimum_live_viewers ?? 0)));

    if (body.game_id) {
      if (!requestedGameChannel && !webhook) return json({ error: "Enter a Discord webhook URL for this game." }, 400);
      if (webhook && !validDiscordWebhook(webhook)) return json({ error: "Enter a valid Discord webhook URL." }, 400);

      const destination = webhook || requestedGameChannel?.destination || "";
      if (!destination) return json({ error: "Enter a Discord webhook URL for this game." }, 400);

      if (!existing) {
        const { error: parentInsertError } = await service.from("notification_channels").insert({
          workspace_id: body.workspace_id,
          type: "discord",
          destination,
          enabled: true,
          minimum_signal_score: 0,
          minimum_live_viewers: 0,
        });
        if (parentInsertError) throw parentInsertError;
      } else if (!existing.enabled) {
        const { error: parentEnableError } = await service
          .from("notification_channels")
          .update({ enabled: true })
          .eq("id", existing.id);
        if (parentEnableError) throw parentEnableError;
      }

      const { error: upsertGameError } = await service.from("game_discord_channels").upsert({
        workspace_id: body.workspace_id,
        game_id: body.game_id,
        destination,
        enabled: true,
        minimum_live_viewers: minimumLiveViewers,
      }, { onConflict: "workspace_id,game_id" });
      if (upsertGameError) throw upsertGameError;

      return json({
        ok: true,
        configured: true,
        enabled: true,
        allowed,
        plan,
        access_kind: accessKind,
        game_id: body.game_id,
        minimum_signal_score: 0,
        minimum_live_viewers: minimumLiveViewers,
      });
    }

    if (!validDiscordWebhook(webhook)) return json({ error: "Enter a valid Discord webhook URL." }, 400);

    const { error: upsertError } = await service.from("notification_channels").upsert({
      workspace_id: body.workspace_id,
      type: "discord",
      destination: webhook,
      enabled: true,
      minimum_signal_score: 0,
      minimum_live_viewers: minimumLiveViewers,
    }, { onConflict: "workspace_id,type" });
    if (upsertError) throw upsertError;

    if (perGameAvailable) {
      const { error: propagateError } = await service
        .from("game_discord_channels")
        .update({
          destination: webhook,
          enabled: true,
          minimum_live_viewers: minimumLiveViewers,
        })
        .eq("workspace_id", body.workspace_id);
      if (propagateError) throw propagateError;
    }

    return json({
      ok: true,
      configured: true,
      allowed,
      plan,
      access_kind: accessKind,
      minimum_signal_score: 0,
      minimum_live_viewers: minimumLiveViewers,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 500);
  }
});
