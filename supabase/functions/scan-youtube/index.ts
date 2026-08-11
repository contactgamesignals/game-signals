import { authorizeRequest, json, jsonHeaders, serviceClient, signalScore, youtubeCadenceMinutes, type Plan } from "../_shared/core.ts";

type Game = {
  id: string;
  workspace_id: string;
  title: string;
  youtube_last_scanned_at: string | null;
};

type SearchItem = {
  id: { videoId: string };
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    channelTitle: string;
    thumbnails?: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
  };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({})) as { game_id?: string; force?: boolean };
    const auth = await authorizeRequest(request, body.game_id);
    if (!auth.internal && !body.game_id) return json({ error: "A user-triggered scan requires game_id." }, 400);

    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) return json({ error: "YouTube API key is not configured." }, 503);

    const supabase = serviceClient();
    let query = supabase.from("games").select("id, workspace_id, title, youtube_last_scanned_at").eq("enabled", true);
    if (body.game_id) query = query.eq("id", body.game_id);
    else {
      const limit = Math.max(1, Math.min(10, Number(Deno.env.get("YOUTUBE_GAMES_PER_RUN") ?? "1")));
      query = query.lte("youtube_next_scan_at", new Date().toISOString()).order("youtube_next_scan_at").limit(limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    const games = (data ?? []) as Game[];
    if (!games.length) return json({ ok: true, games: 0, mentions: 0 });

    const workspaceIds = Array.from(new Set(games.map((game) => game.workspace_id)));
    const { data: subscriptions } = await supabase.from("subscriptions").select("workspace_id, plan").in("workspace_id", workspaceIds);
    const planByWorkspace = new Map((subscriptions ?? []).map((item) => [item.workspace_id as string, item.plan as Plan]));
    let totalMentions = 0;

    for (const game of games) {
      const runStarted = new Date();
      const { data: aliasesData } = await supabase.from("game_aliases").select("phrase, type").eq("game_id", game.id);
      const includes = Array.from(new Set([game.title, ...(aliasesData ?? []).filter((item) => item.type === "include").map((item) => item.phrase as string)]));
      const excludes = (aliasesData ?? []).filter((item) => item.type === "exclude").map((item) => item.phrase as string);
      const searchTerm = `${includes.map((phrase) => `"${phrase.replaceAll('"', '')}"`).join("|")} ${excludes.map((phrase) => `-${phrase}`).join(" ")}`.trim();
      const publishedAfter = game.youtube_last_scanned_at
        ? new Date(new Date(game.youtube_last_scanned_at).getTime() - 5 * 60_000).toISOString()
        : new Date(Date.now() - 24 * 60 * 60_000).toISOString();

      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("order", "date");
      searchUrl.searchParams.set("maxResults", "25");
      searchUrl.searchParams.set("publishedAfter", publishedAfter);
      searchUrl.searchParams.set("q", searchTerm);
      searchUrl.searchParams.set("key", apiKey);

      const searchResponse = await fetch(searchUrl);
      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        await supabase.from("scan_runs").insert({ game_id: game.id, platform: "youtube", status: "failed", finished_at: new Date().toISOString(), error: errorText.slice(0, 2000) });
        continue;
      }

      const searchPayload = await searchResponse.json() as { items?: SearchItem[] };
      const items = searchPayload.items ?? [];
      const ids = items.map((item) => item.id.videoId).filter(Boolean);
      const statistics = new Map<string, number>();

      if (ids.length) {
        const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
        statsUrl.searchParams.set("part", "statistics");
        statsUrl.searchParams.set("id", ids.join(","));
        statsUrl.searchParams.set("key", apiKey);
        const statsResponse = await fetch(statsUrl);
        if (statsResponse.ok) {
          const statsPayload = await statsResponse.json() as { items?: Array<{ id: string; statistics?: { viewCount?: string } }> };
          for (const item of statsPayload.items ?? []) statistics.set(item.id, Number(item.statistics?.viewCount ?? 0));
        }
      }

      let gameMentions = 0;
      for (const item of items) {
        const videoId = item.id.videoId;
        const views = statistics.get(videoId) ?? 0;
        const thumbnail = item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? null;
        const { error: upsertError } = await supabase.from("mentions").upsert({
          game_id: game.id,
          platform: "youtube",
          external_id: videoId,
          creator_external_id: item.snippet.channelId,
          creator_name: item.snippet.channelTitle,
          title: item.snippet.title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnail_url: thumbnail,
          view_count: views,
          published_at: item.snippet.publishedAt,
          last_seen_at: new Date().toISOString(),
          signal_score: signalScore(views, false),
          raw_payload: item,
        }, { onConflict: "platform,external_id" });
        if (!upsertError) gameMentions += 1;
      }

      totalMentions += gameMentions;
      const plan = planByWorkspace.get(game.workspace_id) ?? "free";
      const now = new Date();
      const next = new Date(now.getTime() + youtubeCadenceMinutes(plan) * 60_000).toISOString();
      await Promise.all([
        supabase.from("games").update({ youtube_last_scanned_at: now.toISOString(), youtube_next_scan_at: next }).eq("id", game.id),
        supabase.from("scan_runs").insert({ game_id: game.id, platform: "youtube", status: "success", started_at: runStarted.toISOString(), finished_at: now.toISOString(), results_count: gameMentions, metadata: { query: searchTerm } }),
      ]);
    }

    return json({ ok: true, games: games.length, mentions: totalMentions });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return json({ error: message }, status);
  }
});
