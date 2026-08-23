import { authorizeRequest, chunks, json, jsonHeaders, serviceClient, signalScore, youtubeCadenceMinutes, type Plan } from "../_shared/core.ts";
import {
  classifyYouTubeSearchCandidate,
  matchesYouTubeTrackedGame,
  youtubeWordCount,
  type YouTubeSearchItem as SearchItem,
  type YouTubeVideoDetail as VideoDetail,
} from "../_shared/youtube-matching.ts";

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

type SearchPayload = {
  items?: SearchItem[];
  nextPageToken?: string;
  pageInfo?: { totalResults?: number; resultsPerPage?: number };
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

type PageClassification = {
  accepted: SearchItem[];
  needsDetail: SearchItem[];
  rejectedExternalIds: string[];
};

type DetailCandidate = {
  game_id: string;
  external_id: string;
  raw_payload: SearchItem;
  attempts: number;
};

type QueueProcessingResult = {
  claimed: number;
  accepted: number;
  rejected: number;
  quotaLimited: boolean;
  error: string | null;
};

type StatsResult = {
  views: Map<string, number>;
  requestedBatches: number;
  grantedBatches: number;
  failedBatches: number;
};

const YOUTUBE_SEARCH_PAGE_SIZE = 50;
const YOUTUBE_SCHEDULER_BATCH_SIZE = 80;
const YOUTUBE_SEARCH_CONCURRENCY = 8;
const YOUTUBE_DETAILS_CONCURRENCY = 8;
const YOUTUBE_STATS_CONCURRENCY = 8;
const YOUTUBE_DETAIL_QUEUE_BATCH_SIZE = 500;
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

async function reserveQuota(
  supabase: ReturnType<typeof serviceClient>,
  bucket: "youtube_search" | "youtube_general" | "youtube_stats",
  requested: number,
) {
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

function thumbnailFor(item: SearchItem) {
  return item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? null;
}

function mentionRow(gameId: string, item: SearchItem, views: number | null) {
  const reach = views ?? 0;
  return {
    game_id: gameId,
    platform: "youtube" as const,
    external_id: item.id.videoId,
    creator_external_id: item.snippet.channelId,
    creator_name: item.snippet.channelTitle,
    title: item.snippet.title,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    thumbnail_url: thumbnailFor(item),
    view_count: views,
    published_at: item.snippet.publishedAt,
    last_seen_at: new Date().toISOString(),
    signal_score: signalScore(reach, false),
    raw_payload: item,
  };
}

async function fetchVideoDetailBatch(ids: string[], apiKey: string) {
  const details = new Map<string, VideoDetail>();
  if (!ids.length) return details;

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "statistics,snippet");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("key", apiKey);
  const response = await fetch(url);
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

async function fetchStatsBatch(ids: string[], apiKey: string) {
  const views = new Map<string, number>();
  if (!ids.length) return views;

  const url = new URL("https://www.googleapis.com/youtube/v3/videos:batchGetStats");
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("key", apiKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`YouTube batch stats failed: ${response.status} ${(await response.text()).slice(0, 1000)}`);

  const payload = await response.json() as {
    items?: Array<{ id: string; statistics?: { viewCount?: string } }>;
  };
  for (const item of payload.items ?? []) views.set(item.id, Number(item.statistics?.viewCount ?? 0));
  return views;
}

async function fetchBestEffortStats(
  supabase: ReturnType<typeof serviceClient>,
  ids: string[],
  apiKey: string,
): Promise<StatsResult> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const batches = chunks(uniqueIds, 50);
  if (!batches.length) return { views: new Map(), requestedBatches: 0, grantedBatches: 0, failedBatches: 0 };

  try {
    const granted = await reserveQuota(supabase, "youtube_stats", batches.length);
    const runnable = batches.slice(0, granted);
    const results = await mapLimit(runnable, YOUTUBE_STATS_CONCURRENCY, async (batch) => {
      try {
        return { views: await fetchStatsBatch(batch, apiKey), failed: false };
      } catch (error) {
        console.error("YouTube stats enrichment failed", error);
        return { views: new Map<string, number>(), failed: true };
      }
    });

    const views = new Map<string, number>();
    let failedBatches = 0;
    for (const result of results) {
      if (result.failed) failedBatches += 1;
      for (const [id, count] of result.views) views.set(id, count);
    }
    return { views, requestedBatches: batches.length, grantedBatches: granted, failedBatches };
  } catch (error) {
    console.error("YouTube stats quota reservation failed", error);
    return { views: new Map(), requestedBatches: batches.length, grantedBatches: 0, failedBatches: 0 };
  }
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
    return { removed: 0, refreshed: 0, skippedQuota: false };
  }

  const neededDetailCalls = Math.ceil(mentions.length / 50);
  const granted = await reserveQuota(supabase, "youtube_general", neededDetailCalls);
  if (granted < neededDetailCalls) return { removed: 0, refreshed: 0, skippedQuota: true };

  const details = await fetchVideoDetailsBatched(mentions.map((mention) => mention.external_id), apiKey);
  const rejectedIds: string[] = [];
  const refreshRows: Array<Record<string, unknown>> = [];

  for (const mention of mentions) {
    const item = mention.raw_payload;
    if (!item?.id?.videoId || !item.snippet?.title) continue;
    const detail = details.get(mention.external_id);
    if (!matchesYouTubeTrackedGame(item, detail, includes, excludes)) {
      rejectedIds.push(mention.id);
      continue;
    }
    refreshRows.push(mentionRow(game.id, item, detail?.views ?? null));
  }

  if (rejectedIds.length) {
    const { error: deleteError } = await supabase.from("mentions").delete().in("id", rejectedIds);
    if (deleteError) throw deleteError;
  }
  if (refreshRows.length) {
    const { error: upsertError } = await supabase.from("mentions").upsert(refreshRows, { onConflict: "game_id,platform,external_id" });
    if (upsertError) throw upsertError;
  }

  const { error: updateError } = await supabase
    .from("games")
    .update({ youtube_last_revalidated_at: new Date().toISOString() })
    .eq("id", game.id);
  if (updateError) throw updateError;
  return { removed: rejectedIds.length, refreshed: refreshRows.length, skippedQuota: false };
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

async function enqueueDetailCandidates(
  supabase: ReturnType<typeof serviceClient>,
  rows: Array<{ game_id: string; external_id: string; raw_payload: SearchItem }>,
) {
  if (!rows.length) return 0;
  const { data, error } = await supabase.rpc("enqueue_youtube_detail_candidates", { p_items: rows });
  if (error) throw error;
  return Number(data ?? 0);
}

function candidatePairs(candidates: DetailCandidate[]) {
  return candidates.map((candidate) => ({ game_id: candidate.game_id, external_id: candidate.external_id }));
}

async function processPendingDetailCandidates(
  supabase: ReturnType<typeof serviceClient>,
  apiKey: string,
): Promise<QueueProcessingResult> {
  const { data: claimedData, error: claimError } = await supabase.rpc("claim_youtube_detail_candidates", {
    p_limit: YOUTUBE_DETAIL_QUEUE_BATCH_SIZE,
    p_lease_seconds: YOUTUBE_LEASE_SECONDS,
  });
  if (claimError) return { claimed: 0, accepted: 0, rejected: 0, quotaLimited: false, error: claimError.message };

  const claimed = (claimedData ?? []) as DetailCandidate[];
  if (!claimed.length) return { claimed: 0, accepted: 0, rejected: 0, quotaLimited: false, error: null };

  const detailCallsNeeded = Math.ceil(claimed.length / 50);
  let granted = 0;
  try {
    granted = await reserveQuota(supabase, "youtube_general", detailCallsNeeded);
  } catch (error) {
    await supabase.rpc("release_youtube_detail_candidates", {
      p_pairs: candidatePairs(claimed),
      p_retry_after_seconds: 60,
      p_increment_attempts: false,
    }).catch(() => undefined);
    return { claimed: claimed.length, accepted: 0, rejected: 0, quotaLimited: true, error: error instanceof Error ? error.message : String(error) };
  }

  const runnable = claimed.slice(0, granted * 50);
  const deferred = claimed.slice(runnable.length);
  if (deferred.length) {
    await supabase.rpc("release_youtube_detail_candidates", {
      p_pairs: candidatePairs(deferred),
      p_retry_after_seconds: 60,
      p_increment_attempts: false,
    });
  }
  if (!runnable.length) {
    return { claimed: claimed.length, accepted: 0, rejected: 0, quotaLimited: true, error: null };
  }

  try {
    const details = await fetchVideoDetailsBatched(runnable.map((candidate) => candidate.external_id), apiKey);
    const gameIds = Array.from(new Set(runnable.map((candidate) => candidate.game_id)));
    const [{ data: gameData, error: gameError }, { data: aliasData, error: aliasError }] = await Promise.all([
      supabase.from("games").select("id, title").in("id", gameIds),
      supabase.from("game_aliases").select("game_id, phrase, type").in("game_id", gameIds),
    ]);
    if (gameError) throw gameError;
    if (aliasError) throw aliasError;

    const titleByGame = new Map((gameData ?? []).map((game) => [String(game.id), String(game.title)]));
    const aliases = (aliasData ?? []) as AliasRow[];
    const acceptedRows: Array<Record<string, unknown>> = [];
    let rejected = 0;

    for (const candidate of runnable) {
      const title = titleByGame.get(candidate.game_id);
      const item = candidate.raw_payload;
      if (!title || !item?.id?.videoId || !item.snippet?.title) {
        rejected += 1;
        continue;
      }

      const gameAliases = aliases.filter((row) => row.game_id === candidate.game_id);
      const includes = Array.from(new Set([
        title,
        ...gameAliases.filter((row) => row.type === "include").map((row) => row.phrase),
      ]));
      const excludes = gameAliases.filter((row) => row.type === "exclude").map((row) => row.phrase);
      const detail = details.get(candidate.external_id);
      if (!matchesYouTubeTrackedGame(item, detail, includes, excludes)) {
        rejected += 1;
        continue;
      }
      acceptedRows.push(mentionRow(candidate.game_id, item, detail?.views ?? null));
    }

    if (acceptedRows.length) {
      const { error: upsertError } = await supabase.from("mentions").upsert(acceptedRows, { onConflict: "game_id,platform,external_id" });
      if (upsertError) throw upsertError;
    }

    const { error: completeError } = await supabase.rpc("complete_youtube_detail_candidates", {
      p_pairs: candidatePairs(runnable),
    });
    if (completeError) throw completeError;

    return {
      claimed: claimed.length,
      accepted: acceptedRows.length,
      rejected,
      quotaLimited: deferred.length > 0,
      error: null,
    };
  } catch (error) {
    await supabase.rpc("release_youtube_detail_candidates", {
      p_pairs: candidatePairs(runnable),
      p_retry_after_seconds: 60,
      p_increment_attempts: true,
    }).catch(() => undefined);
    return {
      claimed: claimed.length,
      accepted: 0,
      rejected: 0,
      quotaLimited: deferred.length > 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
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

    if (!games.length) {
      const detailQueue = await processPendingDetailCandidates(supabase, apiKey);
      return json({ ok: !detailQueue.error, games: 0, mentions: detailQueue.accepted, quota_limited: detailQueue.quotaLimited, detail_queue: detailQueue });
    }

    const searchGranted = await reserveQuota(supabase, "youtube_search", games.length);
    if (searchGranted <= 0) {
      await releaseClaims(supabase, games);
      const detailQueue = await processPendingDetailCandidates(supabase, apiKey);
      return json({ ok: !detailQueue.error, games: 0, mentions: detailQueue.accepted, quota_limited: true, claimed: games.length, detail_queue: detailQueue });
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
      const detailQueue = await processPendingDetailCandidates(supabase, apiKey);
      return json({ ok: false, games: runnableGames.length, mentions: detailQueue.accepted, failed: failedSearches.length, quota_limited: false, detail_queue: detailQueue }, 207);
    }

    const classificationByGame = new Map<string, PageClassification>();
    const queuedCandidates: Array<{ game_id: string; external_id: string; raw_payload: SearchItem }> = [];
    const directAcceptedIds: string[] = [];

    for (const result of successfulSearches) {
      const classification: PageClassification = { accepted: [], needsDetail: [], rejectedExternalIds: [] };
      for (const item of result.payload.items ?? []) {
        const videoId = item.id.videoId;
        if (!videoId) continue;
        const decision = classifyYouTubeSearchCandidate(item, result.prepared.includes, result.prepared.excludes);
        if (decision === "accept") {
          classification.accepted.push(item);
          directAcceptedIds.push(videoId);
        } else if (decision === "needs_detail") {
          classification.needsDetail.push(item);
          queuedCandidates.push({ game_id: result.prepared.game.id, external_id: videoId, raw_payload: item });
        } else {
          classification.rejectedExternalIds.push(videoId);
        }
      }
      classificationByGame.set(result.prepared.game.id, classification);
    }

    // Persist every ambiguous result before any scan window can advance. If this
    // fails, the invocation fails and the leased search window is retried safely.
    await enqueueDetailCandidates(supabase, queuedCandidates);

    // View counts are useful but not required to discover a creator. The new
    // batchGetStats quota can run out without blocking mention insertion.
    const stats = await fetchBestEffortStats(supabase, directAcceptedIds, apiKey);

    // Full videos.list metadata is reserved for ambiguous candidates. This queue
    // is durable, so general quota pressure can delay validation but cannot make
    // the search page disappear.
    const detailQueue = await processPendingDetailCandidates(supabase, apiKey);

    let totalMentions = detailQueue.accepted;
    let completedGames = 0;
    let continuationGames = 0;
    let revalidationRemovedTotal = 0;

    for (const result of successfulSearches) {
      const { prepared, payload } = result;
      const game = prepared.game;
      const classification = classificationByGame.get(game.id) ?? { accepted: [], needsDetail: [], rejectedExternalIds: [] };
      const acceptedRows = classification.accepted.map((item) => mentionRow(game.id, item, stats.views.get(item.id.videoId) ?? null));

      if (classification.rejectedExternalIds.length) {
        const { error: deleteError } = await supabase
          .from("mentions")
          .delete()
          .eq("game_id", game.id)
          .eq("platform", "youtube")
          .in("external_id", classification.rejectedExternalIds);
        if (deleteError) throw deleteError;
      }

      if (acceptedRows.length) {
        const { error: upsertError } = await supabase
          .from("mentions")
          .upsert(acceptedRows, { onConflict: "game_id,platform,external_id" });
        if (upsertError) throw upsertError;
      }

      let revalidatedRemoved = 0;
      let revalidatedRefreshed = 0;
      let revalidationSkippedQuota = false;
      let revalidationError: string | null = null;
      if (shouldRevalidate(game, now)) {
        try {
          const revalidation = await revalidateRecentMentions(supabase, game, prepared.includes, prepared.excludes, apiKey);
          revalidatedRemoved = revalidation.removed;
          revalidatedRefreshed = revalidation.refreshed;
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
            candidate_count: payload.items?.length ?? 0,
            search_total_results_approx: payload.pageInfo?.totalResults ?? null,
            search_has_next_page: Boolean(nextPageToken),
            search_results_truncated: false,
            pagination_in_progress: Boolean(nextPageToken),
            snippet_accepted: classification.accepted.length,
            detail_candidates_queued: classification.needsDetail.length,
            snippet_rejected: classification.rejectedExternalIds.length,
            stats_enriched: classification.accepted.filter((item) => stats.views.has(item.id.videoId)).length,
            stats_quota_limited: stats.grantedBatches < stats.requestedBatches,
            stats_failed_batches: stats.failedBatches,
            revalidated_removed: revalidatedRemoved,
            revalidated_refreshed: revalidatedRefreshed,
            revalidation_skipped_quota: revalidationSkippedQuota,
            revalidation_error: revalidationError,
            strict_single_word_filter: prepared.includes.some((phrase) => youtubeWordCount(phrase) === 1),
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
      ok: failedSearches.length === 0 && !detailQueue.error,
      games: runnableGames.length,
      completed_games: completedGames,
      continuation_games: continuationGames,
      mentions: totalMentions,
      revalidated_removed: revalidationRemovedTotal,
      failed: failedSearches.length,
      deferred_by_search_quota: deferredGames.length,
      search_quota_limited: deferredGames.length > 0,
      stats_quota_limited: stats.grantedBatches < stats.requestedBatches,
      detail_queue: detailQueue,
    }, failedSearches.length === 0 && !detailQueue.error ? 200 : 207);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return json({ error: message }, status);
  }
});
