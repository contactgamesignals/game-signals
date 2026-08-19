import { authorizeRequest, json, jsonHeaders, serviceClient, signalScore, youtubeCadenceMinutes, type Plan } from "../_shared/core.ts";

type Game = { id: string; workspace_id: string; title: string; youtube_last_scanned_at: string | null; youtube_next_scan_at: string | null };
type SearchItem = { id: { videoId: string }; snippet: { publishedAt: string; channelId: string; title: string; channelTitle: string; description?: string; thumbnails?: { high?: { url: string }; medium?: { url: string }; default?: { url: string } } } };
type VideoDetail = { views: number; categoryId: string | null; description: string; tags: string[] };

const STRONG_GAME_CONTEXT_HINTS = [
  "gameplay", "playthrough", "walkthrough", "let's play", "lets play", "review", "trailer", "first look",
  "impressions", "roguelike", "roguelite", "fps", "first person shooter", "shooter", "boss fight", "speedrun",
  "steam", "early access", "demo", "hardcore", "episode", "part", "chapter", "run", "guide", "tips", "patch",
  "update", "stream", "vod",
];

const OTHER_GAME_ANCHORS = [
  "minecraft", "roblox", "fortnite", "valorant", "counter strike", "cs2", "league of legends", "dota 2",
  "grand theft auto", "gta 5", "gta v", "call of duty", "warzone", "apex legends", "overwatch", "terraria",
  "palworld", "elden ring", "helldivers 2", "marvel rivals", "deadlock", "destiny 2", "rainbow six siege",
  "rocket league", "pubg", "escape from tarkov", "world of warcraft", "final fantasy xiv", "genshin impact",
];

function normalizeWords(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(value: string, phrase: string) {
  const haystack = normalizeWords(value);
  const needle = normalizeWords(phrase);
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function wordCount(value: string) {
  const normalized = normalizeWords(value);
  return normalized ? normalized.split(" ").length : 0;
}

function phraseOccurrences(value: string, phrase: string) {
  const haystack = ` ${normalizeWords(value)} `;
  const needle = normalizeWords(phrase);
  if (!needle) return 0;
  return Math.max(0, haystack.split(` ${needle} `).length - 1);
}

function exactHashtagMatch(value: string, phrase: string) {
  const needle = normalizeWords(phrase);
  if (!needle || needle.includes(" ")) return false;
  for (const match of value.matchAll(/#([\p{L}\p{N}_-]+)/gu)) {
    if (normalizeWords(match[1] ?? "") === needle) return true;
  }
  return false;
}

function exactTagMatch(tags: string[], phrase: string) {
  const needle = normalizeWords(phrase);
  return tags.some((tag) => normalizeWords(tag) === needle);
}

function hasStrongGameContext(value: string) {
  return STRONG_GAME_CONTEXT_HINTS.some((hint) => containsPhrase(value, hint));
}

function hasForeignGameAnchor(value: string, includes: string[]) {
  return OTHER_GAME_ANCHORS.some((anchor) => {
    if (!containsPhrase(value, anchor)) return false;
    return !includes.some((include) => containsPhrase(include, anchor) || containsPhrase(anchor, include));
  });
}

function explicitMixedCoverage(title: string) {
  const normalized = ` ${normalizeWords(title)} `;
  return title.includes("+") || title.includes("&") || /\bvs\.?\b/i.test(title) || normalized.includes(" versus ") || normalized.includes(" and ");
}

function singleWordGameLooksIntentional(item: SearchItem, detail: VideoDetail, phrase: string, allContext: string, includes: string[]) {
  const title = item.snippet.title;
  const titleMatch = containsPhrase(title, phrase);
  const hashtagMatch = exactHashtagMatch(`${title} ${item.snippet.description ?? ""}`, phrase) || exactTagMatch(detail.tags, phrase);
  const strongContext = hasStrongGameContext(allContext);
  const episodeMarker = /\b(part|episode|ep|chapter|run)\s*\d+\b/i.test(normalizeWords(title));
  const repeatedTarget = phraseOccurrences(`${title} ${item.snippet.description ?? ""}`, phrase) >= 2;
  const foreignAnchor = hasForeignGameAnchor(allContext, includes);
  const mixedCoverage = explicitMixedCoverage(title);

  if (!titleMatch && !hashtagMatch) return false;
  if (foreignAnchor && !mixedCoverage) return false;

  let score = 0;
  if (titleMatch) score += 3;
  if (hashtagMatch) score += 2;
  if (strongContext) score += 2;
  if (episodeMarker) score += 1;
  if (repeatedTarget) score += 1;
  if (foreignAnchor) score -= 2;

  return score >= 5;
}

function matchesTrackedGame(item: SearchItem, detail: VideoDetail | undefined, includes: string[], excludes: string[]) {
  if (!detail || detail.categoryId !== "20") return false;

  const allContext = [
    item.snippet.title,
    item.snippet.description ?? "",
    detail.description,
    ...detail.tags,
  ].join(" ");

  if (excludes.some((phrase) => containsPhrase(allContext, phrase))) return false;

  const matchedIncludes = includes.filter((phrase) => containsPhrase(allContext, phrase));
  if (!matchedIncludes.length) return false;

  const multiWordMatch = matchedIncludes.some((phrase) => wordCount(phrase) > 1);
  if (multiWordMatch) {
    const foreignAnchor = hasForeignGameAnchor(allContext, includes);
    return !foreignAnchor || explicitMixedCoverage(item.snippet.title);
  }

  return matchedIncludes.some((phrase) => singleWordGameLooksIntentional(item, detail, phrase, allContext, includes));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await request.json().catch(() => ({})) as { game_id?: string; force?: boolean; healthcheck?: boolean };
    const auth = await authorizeRequest(request, body.game_id);
    if (!auth.internal && body.healthcheck) return json({ error: "Forbidden" }, 403);
    if (!auth.internal && !body.game_id) return json({ error: "A user-triggered scan requires game_id." }, 400);
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (!apiKey) return json({ error: "YouTube API key is not configured." }, 503);

    if (body.healthcheck) {
      const healthUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      healthUrl.searchParams.set("part", "id");
      healthUrl.searchParams.set("id", "dQw4w9WgXcQ");
      healthUrl.searchParams.set("key", apiKey);
      const response = await fetch(healthUrl);
      if (!response.ok) throw new Error(`YouTube API healthcheck failed: ${response.status} ${await response.text()}`);
      return json({ ok: true, youtube: "authenticated" });
    }

    const supabase = serviceClient();
    let query = supabase.from("games").select("id, workspace_id, title, youtube_last_scanned_at, youtube_next_scan_at").eq("enabled", true);
    if (body.game_id) query = query.eq("id", body.game_id);
    else {
      const limit = Math.max(1, Math.min(10, Number(Deno.env.get("YOUTUBE_GAMES_PER_RUN") ?? "1")));
      query = query.lte("youtube_next_scan_at", new Date().toISOString()).order("youtube_next_scan_at").limit(limit);
    }
    const { data, error } = await query;
    if (error) throw error;
    const games = (data ?? []) as Game[];
    if (!games.length) return json({ ok: true, games: 0, mentions: 0 });

    if (!auth.internal && body.game_id) {
      const nextScanAt = games[0]?.youtube_next_scan_at;
      if (nextScanAt && new Date(nextScanAt).getTime() > Date.now()) {
        return json({
          error: "YouTube scan is not due yet. Manual requests follow the plan cadence to protect the shared API quota.",
          retry_at: nextScanAt,
        }, 429);
      }
    }

    const workspaceIds = Array.from(new Set(games.map((game) => game.workspace_id)));
    const { data: subscriptions } = await supabase.from("subscriptions").select("workspace_id, plan, status").in("workspace_id", workspaceIds);
    const planByWorkspace = new Map((subscriptions ?? []).map((item) => [
      item.workspace_id as string,
      (item.status === "active" || item.status === "trialing" ? item.plan : "free") as Plan,
    ]));

    let totalMentions = 0;
    for (const game of games) {
      const runStarted = new Date();
      const { data: aliasesData } = await supabase.from("game_aliases").select("phrase, type").eq("game_id", game.id);
      const includes = Array.from(new Set([game.title, ...(aliasesData ?? []).filter((item) => item.type === "include").map((item) => item.phrase as string)]));
      const excludes = (aliasesData ?? []).filter((item) => item.type === "exclude").map((item) => item.phrase as string);
      const searchTerm = `${includes.map((phrase) => `"${phrase.replaceAll('"', '')}"`).join("|")} ${excludes.map((phrase) => `-${phrase}`).join(" ")}`.trim();
      const publishedAfter = game.youtube_last_scanned_at
        ? new Date(new Date(game.youtube_last_scanned_at).getTime() - 5 * 60_000).toISOString()
        : new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();

      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("videoCategoryId", "20");
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
      const details = new Map<string, VideoDetail>();
      if (ids.length) {
        const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
        detailsUrl.searchParams.set("part", "statistics,snippet");
        detailsUrl.searchParams.set("id", ids.join(","));
        detailsUrl.searchParams.set("key", apiKey);
        const detailsResponse = await fetch(detailsUrl);
        if (detailsResponse.ok) {
          const detailsPayload = await detailsResponse.json() as { items?: Array<{ id: string; statistics?: { viewCount?: string }; snippet?: { categoryId?: string; description?: string; tags?: string[] } }> };
          for (const item of detailsPayload.items ?? []) {
            details.set(item.id, {
              views: Number(item.statistics?.viewCount ?? 0),
              categoryId: item.snippet?.categoryId ?? null,
              description: item.snippet?.description ?? "",
              tags: item.snippet?.tags ?? [],
            });
          }
        }
      }

      let gameMentions = 0;
      let filteredOut = 0;
      for (const item of items) {
        const videoId = item.id.videoId;
        const detail = details.get(videoId);
        if (!matchesTrackedGame(item, detail, includes, excludes)) {
          filteredOut += 1;
          await supabase.from("mentions").delete().eq("game_id", game.id).eq("platform", "youtube").eq("external_id", videoId);
          continue;
        }

        const views = detail?.views ?? 0;
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
        }, { onConflict: "game_id,platform,external_id" });
        if (!upsertError) gameMentions += 1;
      }

      totalMentions += gameMentions;
      const plan = planByWorkspace.get(game.workspace_id) ?? "free";
      const now = new Date();
      const next = new Date(now.getTime() + youtubeCadenceMinutes(plan) * 60_000).toISOString();
      await Promise.all([
        supabase.from("games").update({ youtube_last_scanned_at: now.toISOString(), youtube_next_scan_at: next }).eq("id", game.id),
        supabase.from("scan_runs").insert({
          game_id: game.id,
          platform: "youtube",
          status: "success",
          started_at: runStarted.toISOString(),
          finished_at: now.toISOString(),
          results_count: gameMentions,
          metadata: {
            query: searchTerm,
            published_after: publishedAfter,
            youtube_category_id: "20",
            filtered_out: filteredOut,
            strict_single_word_filter: includes.some((phrase) => wordCount(phrase) === 1),
          },
        }),
      ]);
    }

    return json({ ok: true, games: games.length, mentions: totalMentions });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return json({ error: message }, status);
  }
});
