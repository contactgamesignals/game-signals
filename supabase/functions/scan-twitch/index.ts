import { authorizeRequest, chunks, json, jsonHeaders, serviceClient, signalScore, twitchCadenceMinutes, type Plan } from "../_shared/core.ts";

type Game = { id: string; workspace_id: string; title: string; twitch_game_id: string | null; twitch_last_scanned_at: string | null };
type TwitchStream = { id: string; user_id: string; user_login: string; user_name: string; game_id: string; game_name: string; title: string; viewer_count: number; started_at: string; language: string; thumbnail_url: string };

const MANUAL_SCAN_COOLDOWN_MS = 5 * 60_000;

async function twitchToken(clientId: string, clientSecret: string) {
  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) throw new Error(`Twitch token failed: ${response.status} ${await response.text()}`);
  const data = await response.json() as { access_token: string };
  return data.access_token;
}

async function resolveCategory(title: string, clientId: string, token: string) {
  const url = new URL("https://api.twitch.tv/helix/search/categories");
  url.searchParams.set("query", title);
  url.searchParams.set("first", "20");
  const response = await fetch(url, { headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Twitch category search failed: ${response.status} ${await response.text()}`);
  const payload = await response.json() as { data: Array<{ id: string; name: string }> };
  const exact = payload.data.find((item) => item.name.localeCompare(title, undefined, { sensitivity: "accent" }) === 0);
  return exact ?? payload.data[0] ?? null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await request.json().catch(() => ({})) as { game_id?: string; force?: boolean; healthcheck?: boolean };
    const auth = await authorizeRequest(request, body.game_id);
    if (!auth.internal && body.healthcheck) return json({ error: "Forbidden" }, 403);
    if (!auth.internal && !body.game_id) return json({ error: "A user-triggered scan requires game_id." }, 400);

    const clientId = Deno.env.get("TWITCH_CLIENT_ID");
    const clientSecret = Deno.env.get("TWITCH_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json({ error: "Twitch secrets are not configured." }, 503);

    if (body.healthcheck) {
      await twitchToken(clientId, clientSecret);
      return json({ ok: true, twitch: "authenticated" });
    }

    const supabase = serviceClient();
    let query = supabase.from("games").select("id, workspace_id, title, twitch_game_id, twitch_last_scanned_at").eq("enabled", true);
    if (body.game_id) query = query.eq("id", body.game_id);
    else query = query.lte("twitch_next_scan_at", new Date().toISOString()).limit(100);
    const { data, error } = await query;
    if (error) throw error;
    const games = (data ?? []) as Game[];
    if (!games.length) return json({ ok: true, games: 0, mentions: 0 });

    if (!auth.internal && body.game_id) {
      const lastScannedAt = games[0]?.twitch_last_scanned_at;
      if (lastScannedAt) {
        const retryAt = new Date(new Date(lastScannedAt).getTime() + MANUAL_SCAN_COOLDOWN_MS);
        if (retryAt.getTime() > Date.now()) {
          return json({
            error: "Twitch manual scans are limited to one request every five minutes per game.",
            retry_at: retryAt.toISOString(),
          }, 429);
        }
      }
    }

    const token = await twitchToken(clientId, clientSecret);
    const prepared: Game[] = [];
    for (const game of games) {
      if (game.twitch_game_id) { prepared.push(game); continue; }
      const category = await resolveCategory(game.title, clientId, token);
      if (!category) {
        await supabase.from("scan_runs").insert({ game_id: game.id, platform: "twitch", status: "failed", finished_at: new Date().toISOString(), error: "No matching Twitch category." });
        continue;
      }
      await supabase.from("games").update({ twitch_game_id: category.id }).eq("id", game.id);
      prepared.push({ ...game, twitch_game_id: category.id });
    }

    const workspaceIds = Array.from(new Set(prepared.map((game) => game.workspace_id)));
    const { data: subscriptions } = await supabase.from("subscriptions").select("workspace_id, plan, status").in("workspace_id", workspaceIds);
    const planByWorkspace = new Map((subscriptions ?? []).map((item) => [
      item.workspace_id as string,
      (item.status === "active" || item.status === "trialing" ? item.plan : "free") as Plan,
    ]));
    const gameByTwitchId = new Map(prepared.map((game) => [game.twitch_game_id as string, game]));
    let inserted = 0;
    const resultsByGame = new Map<string, number>();

    for (const batch of chunks(prepared, 100)) {
      const url = new URL("https://api.twitch.tv/helix/streams");
      url.searchParams.set("first", "100");
      batch.forEach((game) => url.searchParams.append("game_id", game.twitch_game_id as string));
      const response = await fetch(url, { headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Twitch streams failed: ${response.status} ${await response.text()}`);
      const payload = await response.json() as { data: TwitchStream[] };
      for (const stream of payload.data) {
        const game = gameByTwitchId.get(stream.game_id);
        if (!game) continue;
        const { error: upsertError } = await supabase.from("mentions").upsert({
          game_id: game.id, platform: "twitch", external_id: stream.id, creator_external_id: stream.user_id,
          creator_name: stream.user_name, title: stream.title || `${stream.user_name} is live`,
          url: `https://www.twitch.tv/${stream.user_login}`,
          thumbnail_url: stream.thumbnail_url.replace("{width}", "640").replace("{height}", "360"),
          viewer_count: stream.viewer_count, language: stream.language, published_at: stream.started_at,
          last_seen_at: new Date().toISOString(), signal_score: signalScore(stream.viewer_count, true), raw_payload: stream,
        }, { onConflict: "platform,external_id" });
        if (!upsertError) { inserted += 1; resultsByGame.set(game.id, (resultsByGame.get(game.id) ?? 0) + 1); }
      }
    }

    const now = new Date();
    for (const game of prepared) {
      const plan = planByWorkspace.get(game.workspace_id) ?? "free";
      const next = new Date(now.getTime() + twitchCadenceMinutes(plan) * 60_000).toISOString();
      await Promise.all([
        supabase.from("games").update({ twitch_last_scanned_at: now.toISOString(), twitch_next_scan_at: next }).eq("id", game.id),
        supabase.from("scan_runs").insert({ game_id: game.id, platform: "twitch", status: "success", finished_at: now.toISOString(), results_count: resultsByGame.get(game.id) ?? 0 }),
      ]);
    }
    return json({ ok: true, games: prepared.length, mentions: inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return json({ error: message }, status);
  }
});
