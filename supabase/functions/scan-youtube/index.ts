import { authorizeRequest, chunks, json, jsonHeaders, serviceClient, signalScore, youtubeCadenceMinutes, type Plan } from "../_shared/core.ts";

type Game = {
  id: string;
  workspace_id: string;
  title: string;
  youtube_last_scanned_at: string | null;
  youtube_next_scan_at: string;
  youtube_claimed_until: string | null;
  youtube_scan_window_start: string | null;
  youtube_scan_window_end: string | null;
  youtube_scan_page_token: string | null;
  youtube_scan_pages_completed: number;
  youtube_last_revalidated_at: string | null;
};

type SearchItem = {
  id: { videoId: string };
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    channelTitle: string;
    description?: string;
    thumbnails?: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
  };
};

type SearchPayload = {
  items?: SearchItem[];
  nextPageToken?: string;
  pageInfo?: { totalResults?: number; resultsPerPage?: number };
};

type VideoDetail = {
  views: number;
  categoryId: string | null;
  description: string;
  tags: string[];
};

type ExistingMention = {
  id: string;
  external_id: string;
  raw_payload: SearchItem | null;
};

type AliasRow = {
  game_id: string;
  phrase: string;
  type: "include" | "exclude";
};

type PreparedGame = {
  game: Game;
  includes: string[];
  excludes: string[];
  searchTerm: string;
  windowStart: string;
  windowEnd: string;
  pageToken: string | null;
  queueDelayMinutes: number;
  scanIntervalMinutes: number | null;
  runStarted: Date;
};

type SearchResult = {
  prepared: PreparedGame;
  payload: SearchPayload | null;
  error: string | null;
};

const YOUTUBE_SEARCH_PAGE_SIZE = 50;
const YOUTUBE_SCHEDULER_BATCH_SIZE = 80;
const YOUTUBE_SEARCH_CONCURRENCY = 8;
const YOUTUBE_DETAILS_CONCURRENCY = 8;
const YOUTUBE_REVALIDATE_EVERY_MS = 24 * 60 * 60_000;
const YOUTUBE_REVALIDATE_LIMIT = 100;
const YOUTUBE_LEASE_SECONDS = 120;

const GAME_SELECT = [
  "id",
  "workspace_id",
  "title",
  "youtube_last_scanned_at",
  "youtube_next_scan_at",
  "youtube_claimed_until",
  "youtube_scan_window_start",
  "youtube_scan_window_end",
  "youtube_scan_page_token",
  "youtube_scan_pages_completed",
  "youtube_last_revalidated_at",
].join(",");

const STRONG_GAME_CONTEXT_HINTS = [
  "gameplay", "playthrough", "walkthrough", "let's play", "lets play", "review", "trailer", "first look",
  "impressions", "roguelike", "roguelite", "fps", "first person shooter", "shooter", "boss fight", "speedrun",
  "steam", "early access", "demo", "hardcore", "episode", "part", "chapter", "run", "guide", "tips",
  "stream", "vod",
];

const OTHER_GAME_ANCHORS = [
  "minecraft", "roblox", "fortnite", "valorant", "counter strike", "cs2", "league of legends", "dota 2",
  "grand theft auto", "gta 5", "gta v", "call of duty", "warzone", "apex legends", "overwatch", "terraria",
  "rust", "palworld", "elden ring", "hades ii", "helldivers 2", "marvel rivals", "deadlock", "destiny 2",
  "rainbow six siege", "rocket league", "pubg", "escape from tarkov", "world of warcraft", "final fantasy xiv",
  "genshin impact", "spongebob", "last island of survival", "rock band", "starrupture", "uhc", "smp",
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

function gameTitleSyntax(title: string, phrase: string) {
  const normalizedTitle = normalizeWords(title);
  const needle = normalizeWords(phrase);
  if (!normalizedTitle || !needle) return false;
  if (normalizedTitle.endsWith(` in ${needle}`) || normalizedTitle === `in ${needle}`) return true;

  const prefixPatterns = ["playing", "play", "beat", "beating", "trying", "try"];
  if (prefixPatterns.some((prefix) => normalizedTitle.includes(`${prefix} ${needle}`))) return true;

  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const titleWithMarker = new RegExp(`(^|[|:\\-])\\s*${escaped}\\s*(?:#?\\d|[|:\\-])`, "iu");
  const titleAfterSeparator = new RegExp(`[|:\\-]\\s*${escaped}\\s*$`, "iu");
  const numberedAfterTitle = new RegExp(`(^|\\s)${escaped}\\s*#?\\d`, "iu");
  return titleWithMarker.test(title) || titleAfterSeparator.test(title) || numberedAfterTitle.test(title);
}

function singleWordGameLooksIntentional(item: SearchItem, detail: VideoDetail, phrase: string, allContext: string, includes: string[]) {
  const title = item.snippet.title;
  const titleMatch = containsPhrase(title, phrase);
  const hashtagMatch = exactHashtagMatch(`${title} ${item.snippet.description ?? ""}`, phrase) || exactTagMatch(detail.tags, phrase);
  const strongContext = hasStrongGameContext(allContext);
  const syntaxMatch = gameTitleSyntax(title, phrase);
  const episodeMarker = /\b(part|episode|ep|chapter|run)\s*#?\d+/i.test(normalizeWords(title));
  const repeatedTarget = phraseOccurrences(`${title} ${item.snippet.description ?? ""}`, phrase) >= 2;
  const foreignAnchor = hasForeignGameAnchor(allContext, includes);
  const mixedCoverage = explicitMixedCoverage(title);

  if (!titleMatch && !hashtagMatch) return false;
  if (foreignAnchor && !mixedCoverage) return false;
  if (foreignAnchor && mixedCoverage && !hashtagMatch && !episodeMarker && !syntaxMatch) return false;

  let score = 0;
  if (titleMatch) score += 3;
  if (hashtagMatch) score += 1;
  if (strongContext) score += 2;
  if (syntaxMatch) score += 2;
  if (episodeMarker) score += 1;
  if (repeatedTarget) score += 1;

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

async function mapLimit<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function reserveQuota(supabase: ReturnType<typeof serviceClient>, bucket: "youtube_search" | "youtube_general", requested: number) {
  if (requested <= 0) return 0;
  const { data, error } = await supabase.rpc("reserve_monitoring_quota", {
    p_bucket: bucket,
    p_requested: requested,
  });
  if (error) throw error;
  return Math.max(0, Number(data ?? 0));
}

async function releaseClaims(supabase: ReturnType<typeof serviceClient>, games: Game[]) {
  if (!games.length) return;
  const { error } = await supabase
    .from("games")
    .update({ youtube_claimed_until: null })
    .in("id", games.map((game) => game.id));
  if (error) throw error;
}

async function fetchVideoDetailBatch(ids: string[], apiKey: string) {
  const details = new Map<string, VideoDetail>();
  if (!ids.length) return details;

  const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  detailsUrl.searchParams.set("part", "statistics,snippet");
  detailsUrl.searchParams.set("id", ids.join(","));
  detailsUrl.searchParams.set("key", apiKey);
  const response = await fetch(detailsUrl);
  if (!response.ok) {
    throw new Error(`YouTube video details failed: ${response.status} ${(await response.text()).slice(0, 1000)}`);
  }

  const payload = await response.json() as {
    items?: Array<{
      id: string;
      statistics?: { viewCount?: string };
      snippet?: { categoryId?: string; description?: string; tags?: string[] };
    }>;
  };

  for (const item of payload.items ?? []) {
    details.set(item.id, {
      views: Number(item.statistics?.viewCount ?? 0),
      categoryId: item.snippet?.categoryId ?? null,
      description: item.snippet?.description ?? "",
      tags: item.snippet?.tags ?? [],
    });
  }
  return details;
}

async function fetchVideoDetailsBatched(ids: string[], apiKey: string) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const batches = chunks(uniqueIds, 50);
  const maps = await mapLimit(batches, YOUTUBE_DETAILS_CONCURRENCY, (batch) => fetchVideoDetailBatch(batch, apiKey));
  const details = new Map<string, VideoDetail>();
  for (const map of maps) {
    for (const [id, detail] of map) details.set(id, detail);
  }
  return details;
}

function shouldRevalidate(game: Game, now: Date) {
  if (!game.youtube_last_revalidated_at) return true;
  return now.getTime() - new Date(game.youtube_last_revalidated_at).getTime() >= YOUTUBE_REVALIDATE_EVERY_MS;
}

async function revalidateRecentMentions(
  supabase: ReturnType<typeof serviceClient>,
  game: Game,
  includes: string[],
  excludes: string[],
  apiKey: string,
) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("mentions")
    .select("id, external_id, raw_payload")
    .eq("game_id", game.id)
    .eq("platform", "youtube")
    .gte("detected_at", since)
    .order("detected_at", { ascending: false })
    .limit(YOUTUBE_REVALIDATE_LIMIT);
  if (error) throw error;

  const mentions = (data ?? []) as ExistingMention[];
  if (!mentions.length) {
    const { error: updateError } = await supabase
      .from("games")
      .update({ youtube_last_revalidated_at: new Date().toISOString() })
      .eq("id", game.id);
    if (updateError) throw updateError;
    return { removed: 0, skippedQuota: false };
  }

  const neededDetailCalls = Math.ceil(mentions.length / 50);
  const granted = await reserveQuota(supabase, "youtube_general", neededDetailCalls);
  if (granted < neededDetailCalls) return { removed: 0, skippedQuota: true };

  const details = await fetchVideoDetailsBatched(mentions.map((mention) => mention.external_id), apiKey);
  const rejectedIds: string[] = [];
  for (const mention of mentions) {
    const item = mention.raw_payload;
    if (!item?.id?.videoId || !item.snippet?.title) continue;
    if (!matchesTrackedGame(item, details.get(mention.external_id), includes, excludes)) rejectedIds.push(mention.id);
  }

  if (rejectedIds.length) {
    const { error: deleteError } = await supabase.from("mentions").delete().in("id", rejectedIds);
    if (deleteError) throw deleteError;
  }

  const { error: updateError } = await supabase
    .from("games")
    .update({ youtube_last_revalidated_at: new Date().toISOString() })
    .eq("id", game.id);
  if (updateError) throw updateError;
  return { removed: rejectedIds.length, skippedQuota: false };
}

function prepareGame(game: Game, aliases: AliasRow[], now: Date): PreparedGame {
  const gameAliases = aliases.filter((row) => row.game_id === game.id);
  const includes = Array.from(new Set([
    game.title,
    ...gameAliases.filter((item) => item.type === "include").map((item) => item.phrase),
  ]));
  const excludes = gameAliases.filter((item) => item.type === "exclude").map((item) => item.phrase);
  const searchTerm = `${includes.map((phrase) => `"${phrase.replaceAll('"', '')}"`).join("|")} ${excludes.map((phrase) => `-${phrase}`).join(" ")}`.trim();

  const continuing = Boolean(game.youtube_scan_window_start && game.youtube_scan_window_end && game.youtube_scan_page_token);
  const windowStart = continuing
    ? game.youtube_scan_window_start as string
    : game.youtube_last_scanned_at
      ? new Date(new Date(game.youtube_last_scanned_at).getTime() - 5 * 60_000).toISOString()
      : new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();
  const windowEnd = continuing ? game.youtube_scan_window_end as string : now.toISOString();
  const queueDelayMinutes = Math.max(0, Math.round((now.getTime() - new Date(game.youtube_next_scan_at).getTime()) / 60_000));
  const scanIntervalMinutes = game.youtube_last_scanned_at
    ? Math.max(0, Math.round((now.getTime() - new Date(game.youtube_last_scanned_at).getTime()) / 60_000))
    : null;

  return {
    game,
    includes,
    excludes,
    searchTerm,
    windowStart,
    windowEnd,
    pageToken: continuing ? game.youtube_scan_page_token : null,
    queueDelayMinutes,
    scanIntervalMinutes,
    runStarted: now,
  };
}

async function searchGamePage(prepared: PreparedGame, apiKey: string): Promise<SearchResult> {
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoCategoryId", "20");
  searchUrl.searchParams.set("safeSearch", "none");
  searchUrl.searchParams.set("order", "date");
  searchUrl.searchParams.set("maxResults", String(YOUTUBE_SEARCH_PAGE_SIZE));
  searchUrl.searchParams.set("publishedAfter", prepared.windowStart);
  searchUrl.searchParams.set("publishedBefore", prepared.windowEnd);
  searchUrl.searchParams.set("q", prepared.searchTerm);
  if (prepared.pageToken) searchUrl.searchParams.set("pageToken", prepared.pageToken);
  searchUrl.searchParams.set("key", apiKey);

  try {
    const response = await fetch(searchUrl);
    if (!response.ok) {
      return {
        prepared,
        payload: null,
        error: `YouTube search failed: ${response.status} ${(await response.text()).slice(0, 1500)}`,
      };
    }
    return { prepared, payload: await response.json() as SearchPayload, error: null };
  } catch (error) {
    return {
      prepared,
      payload: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function recordFailedSearch(supabase: ReturnType<typeof serviceClient>, result: SearchResult) {
  const now = new Date().toISOString();
  const [runResult, claimResult] = await Promise.all([
    supabase.from("scan_runs").insert({
      game_id: result.prepared.game.id,
      platform: "youtube",
      status: "failed",
      started_at: result.prepared.runStarted.toISOString(),
      finished_at: now,
      error: (result.error ?? "YouTube search failed.").slice(0, 2000),
      metadata: {
        query: result.prepared.searchTerm,
        published_after: result.prepared.windowStart,
        published_before: result.prepared.windowEnd,
        continuation_page: Boolean(result.prepared.pageToken),
        page_number: result.prepared.game.youtube_scan_pages_completed + 1,
      },
    }),
    supabase.from("games").update({ youtube_claimed_until: null }).eq("id", result.prepared.game.id),
  ]);
  if (runResult.error) throw runResult.error;
  if (claimResult.error) throw claimResult.error;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({})) as { game_id?: string; healthcheck?: boolean };
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
    let games: Game[] = [];

    if (body.game_id) {
      const { data, error } = await supabase.from("games").select(GAME_SELECT).eq("id", body.game_id).eq("enabled", true).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Game not found or monitoring is paused." }, 404);
      const game = data as Game;

      if (!auth.internal && game.youtube_next_scan_at && new Date(game.youtube_next_scan_at).getTime() > Date.now() && !game.youtube_scan_page_token) {
        return json({
          error: "YouTube scan is not due yet. Manual requests follow the plan cadence to protect the shared API quota.",
          retry_at: game.youtube_next_scan_at,
        }, 429);
      }

      if (game.youtube_claimed_until && new Date(game.youtube_claimed_until).getTime() > Date.now()) {
        return json({ error: "A YouTube scan for this game is already running. Try again shortly." }, 409);
      }

      const claimUntil = new Date(Date.now() + YOUTUBE_LEASE_SECONDS * 1000).toISOString();
      const { error: claimError } = await supabase.from("games").update({ youtube_claimed_until: claimUntil }).eq("id", game.id);
      if (claimError) throw claimError;
      games = [{ ...game, youtube_claimed_until: claimUntil }];
    } else {
      const configuredBatchSize = Number(Deno.env.get("YOUTUBE_GAMES_PER_RUN") ?? YOUTUBE_SCHEDULER_BATCH_SIZE);
      const claimLimit = Math.max(1, Math.min(200, Number.isFinite(configuredBatchSize) ? Math.round(configuredBatchSize) : YOUTUBE_SCHEDULER_BATCH_SIZE));
      const { data, error } = await supabase.rpc("claim_due_youtube_games", {
        p_limit: claimLimit,
        p_lease_seconds: YOUTUBE_LEASE_SECONDS,
      });
      if (error) throw error;
      games = (data ?? []) as Game[];
    }

    if (!games.length) return json({ ok: true, games: 0, mentions: 0, quota_limited: false });

    const searchGranted = await reserveQuota(supabase, "youtube_search", games.length);
    if (searchGranted <= 0) {
      await releaseClaims(supabase, games);
      return json({ ok: true, games: 0, mentions: 0, quota_limited: true, claimed: games.length });
    }

    const runnableGames = games.slice(0, searchGranted);
    const deferredGames = games.slice(searchGranted);
    if (deferredGames.length) await releaseClaims(supabase, deferredGames);

    const gameIds = runnableGames.map((game) => game.id);
    const workspaceIds = Array.from(new Set(runnableGames.map((game) => game.workspace_id)));
    const [{ data: aliasData, error: aliasError }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
      supabase.from("game_aliases").select("game_id, phrase, type").in("game_id", gameIds),
      supabase.from("subscriptions").select("workspace_id, plan, status").in("workspace_id", workspaceIds),
    ]);
    if (aliasError) throw aliasError;
    if (subscriptionError) throw subscriptionError;

    const planByWorkspace = new Map((subscriptions ?? []).map((item) => [
      item.workspace_id as string,
      (item.status === "active" || item.status === "trialing" ? item.plan : "free") as Plan,
    ]));

    const now = new Date();
    const aliases = (aliasData ?? []) as AliasRow[];
    const prepared = runnableGames.map((game) => prepareGame(game, aliases, now));
    const searchResults = await mapLimit(prepared, YOUTUBE_SEARCH_CONCURRENCY, (item) => searchGamePage(item, apiKey));

    const failedSearches = searchResults.filter((result) => result.error || !result.payload);
    for (const failed of failedSearches) await recordFailedSearch(supabase, failed);

    const successfulSearches = searchResults.filter((result): result is SearchResult & { payload: SearchPayload } => Boolean(result.payload && !result.error));
    if (!successfulSearches.length) {
      return json({ ok: false, games: runnableGames.length, mentions: 0, failed: failedSearches.length, quota_limited: false }, 207);
    }

    const allCandidateIds = Array.from(new Set(successfulSearches.flatMap((result) =>
      (result.payload.items ?? []).map((item) => item.id.videoId).filter(Boolean)
    )));
    const detailCallsNeeded = Math.ceil(allCandidateIds.length / 50);
    const detailGranted = await reserveQuota(supabase, "youtube_general", detailCallsNeeded);

    if (detailGranted < detailCallsNeeded) {
      await releaseClaims(supabase, successfulSearches.map((result) => result.prepared.game));
      for (const result of successfulSearches) {
        await supabase.from("scan_runs").insert({
          game_id: result.prepared.game.id,
          platform: "youtube",
          status: "failed",
          started_at: result.prepared.runStarted.toISOString(),
          finished_at: new Date().toISOString(),
          error: "YouTube general quota pacing deferred video details. The same search window will be retried.",
          metadata: {
            query: result.prepared.searchTerm,
            published_after: result.prepared.windowStart,
            published_before: result.prepared.windowEnd,
            candidate_count: result.payload.items?.length ?? 0,
            continuation_page: Boolean(result.prepared.pageToken),
          },
        });
      }
      return json({ ok: true, games: 0, mentions: 0, quota_limited: true, search_pages_consumed: successfulSearches.length });
    }

    const details = await fetchVideoDetailsBatched(allCandidateIds, apiKey);
    let totalMentions = 0;
    let completedGames = 0;
    let continuationGames = 0;
    let revalidationRemovedTotal = 0;

    for (const result of successfulSearches) {
      const { prepared, payload } = result;
      const game = prepared.game;
      const items = payload.items ?? [];
      const acceptedRows: Array<Record<string, unknown>> = [];
      const filteredExternalIds: string[] = [];
      let missingVideoDetails = 0;

      for (const item of items) {
        const videoId = item.id.videoId;
        const detail = details.get(videoId);
        if (!detail) missingVideoDetails += 1;
        if (!matchesTrackedGame(item, detail, prepared.includes, prepared.excludes)) {
          filteredExternalIds.push(videoId);
          continue;
        }

        const views = detail?.views ?? 0;
        const thumbnail = item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? null;
        acceptedRows.push({
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
        });
      }

      if (filteredExternalIds.length) {
        const { error: deleteError } = await supabase
          .from("mentions")
          .delete()
          .eq("game_id", game.id)
          .eq("platform", "youtube")
          .in("external_id", filteredExternalIds);
        if (deleteError) throw deleteError;
      }

      if (acceptedRows.length) {
        const { error: upsertError } = await supabase
          .from("mentions")
          .upsert(acceptedRows, { onConflict: "game_id,platform,external_id" });
        if (upsertError) throw upsertError;
      }

      let revalidatedRemoved = 0;
      let revalidationSkippedQuota = false;
      let revalidationError: string | null = null;
      if (shouldRevalidate(game, now)) {
        try {
          const revalidation = await revalidateRecentMentions(supabase, game, prepared.includes, prepared.excludes, apiKey);
          revalidatedRemoved = revalidation.removed;
          revalidationSkippedQuota = revalidation.skippedQuota;
          revalidationRemovedTotal += revalidatedRemoved;
        } catch (error) {
          revalidationError = error instanceof Error ? error.message : String(error);
        }
      }

      const finishedAt = new Date();
      const nextPageToken = payload.nextPageToken ?? null;
      const nextPageNumber = game.youtube_scan_pages_completed + 1;
      const plan = planByWorkspace.get(game.workspace_id) ?? "free";
      const nextDueAt = nextPageToken
        ? finishedAt.toISOString()
        : new Date(finishedAt.getTime() + youtubeCadenceMinutes(plan) * 60_000).toISOString();

      const gameUpdate = nextPageToken
        ? {
            youtube_claimed_until: null,
            youtube_scan_window_start: prepared.windowStart,
            youtube_scan_window_end: prepared.windowEnd,
            youtube_scan_page_token: nextPageToken,
            youtube_scan_pages_completed: nextPageNumber,
            youtube_next_scan_at: nextDueAt,
          }
        : {
            youtube_claimed_until: null,
            youtube_last_scanned_at: prepared.windowEnd,
            youtube_next_scan_at: nextDueAt,
            youtube_scan_window_start: null,
            youtube_scan_window_end: null,
            youtube_scan_page_token: null,
            youtube_scan_pages_completed: 0,
          };

      const [gameUpdateResult, scanRunResult] = await Promise.all([
        supabase.from("games").update(gameUpdate).eq("id", game.id),
        supabase.from("scan_runs").insert({
          game_id: game.id,
          platform: "youtube",
          status: "success",
          started_at: prepared.runStarted.toISOString(),
          finished_at: finishedAt.toISOString(),
          results_count: acceptedRows.length,
          metadata: {
            query: prepared.searchTerm,
            published_after: prepared.windowStart,
            published_before: prepared.windowEnd,
            youtube_category_id: "20",
            safe_search: "none",
            search_page_size: YOUTUBE_SEARCH_PAGE_SIZE,
            page_number: nextPageNumber,
            continuation_page: Boolean(prepared.pageToken),
            candidate_count: items.length,
            search_total_results_approx: payload.pageInfo?.totalResults ?? null,
            search_has_next_page: Boolean(nextPageToken),
            search_results_truncated: false,
            pagination_in_progress: Boolean(nextPageToken),
            filtered_out: filteredExternalIds.length,
            missing_video_details: missingVideoDetails,
            revalidated_removed: revalidatedRemoved,
            revalidation_skipped_quota: revalidationSkippedQuota,
            revalidation_error: revalidationError,
            strict_single_word_filter: prepared.includes.some((phrase) => wordCount(phrase) === 1),
            queue_delay_minutes: prepared.queueDelayMinutes,
            scan_interval_minutes: prepared.scanIntervalMinutes,
          },
        }),
      ]);
      if (gameUpdateResult.error) throw gameUpdateResult.error;
      if (scanRunResult.error) throw scanRunResult.error;

      totalMentions += acceptedRows.length;
      if (nextPageToken) continuationGames += 1;
      else completedGames += 1;
    }

    return json({
      ok: failedSearches.length === 0,
      games: runnableGames.length,
      completed_games: completedGames,
      continuation_games: continuationGames,
      mentions: totalMentions,
      revalidated_removed: revalidationRemovedTotal,
      failed: failedSearches.length,
      deferred_by_quota: deferredGames.length,
      quota_limited: deferredGames.length > 0,
    }, failedSearches.length === 0 ? 200 : 207);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return json({ error: message }, status);
  }
});
