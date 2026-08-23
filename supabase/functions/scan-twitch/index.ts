import { authorizeRequest, chunks, json, jsonHeaders, serviceClient, signalScore, twitchCadenceMinutes, type Plan } from "../_shared/core.ts";

type Game = {
  id: string;
  workspace_id: string;
  title: string;
  twitch_game_id: string | null;
  twitch_last_scanned_at: string | null;
  twitch_next_scan_at: string;
  twitch_claimed_until: string | null;
  twitch_category_ids: string[];
  twitch_category_names: string[];
  twitch_category_checked_at: string | null;
};

type GameAlias = { game_id: string; phrase: string };
type TwitchCategory = { id: string; name: string };
type TwitchStream = {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
};

type PreparedGame = Game & {
  categoryIds: string[];
  categoryNames: string[];
  matchSource: "cached" | "title" | "alias";
  matchPhrase: string | null;
};

type StreamGroupResult = {
  categoryIds: string[];
  streamsByCategory: Map<string, TwitchStream[]>;
  pages: number;
  complete: boolean;
  rateLimitRemaining: number | null;
  rateLimitReset: number | null;
  error: string | null;
};

const MANUAL_SCAN_COOLDOWN_MS = 5 * 60_000;
const TWITCH_SCHEDULER_BATCH_SIZE = 120;
const TWITCH_LEASE_SECONDS = 120;
const TWITCH_CATEGORY_CACHE_MS = 7 * 24 * 60 * 60_000;
const TWITCH_NO_CATEGORY_BACKOFF_MS = 6 * 60 * 60_000;
const TWITCH_UPSERT_BATCH_SIZE = 200;
const TWITCH_CATEGORY_GROUP_SIZE = 10;
const TWITCH_MAX_PAGES_PER_GROUP = 100;
const TWITCH_RATE_LIMIT_FLOOR = 40;
const TWITCH_INVOCATION_BUDGET_MS = 100_000;
const MIN_ALIAS_CATEGORY_LENGTH = 4;

const GAME_SELECT = [
  "id",
  "workspace_id",
  "title",
  "twitch_game_id",
  "twitch_last_scanned_at",
  "twitch_next_scan_at",
  "twitch_claimed_until",
  "twitch_category_ids",
  "twitch_category_names",
  "twitch_category_checked_at",
].join(",");

let tokenCache: { token: string; expiresAt: number } | null = null;

function categoryMatchesTitle(categoryName: string, title: string) {
  return categoryName.localeCompare(title, undefined, { sensitivity: "accent" }) === 0;
}

function uniqueAliases(title: string, aliases: string[]) {
  const titleKey = title.trim().toLocaleLowerCase();
  return Array.from(new Set(
    aliases
      .map((value) => value.trim())
      .filter((value) => value.length >= MIN_ALIAS_CATEGORY_LENGTH)
      .filter((value) => value.toLocaleLowerCase() !== titleKey),
  )).sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function allowedCategoryNames(game: Game, aliases: string[]) {
  return [game.title, ...uniqueAliases(game.title, aliases)];
}

function categoryCacheFresh(game: Game) {
  if (!game.twitch_category_ids?.length || !game.twitch_category_checked_at) return false;
  return Date.now() - new Date(game.twitch_category_checked_at).getTime() < TWITCH_CATEGORY_CACHE_MS;
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

async function twitchToken(clientId: string, clientSecret: string) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) throw new Error(`Twitch token failed: ${response.status} ${await response.text()}`);
  const data = await response.json() as { access_token: string; expires_in?: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in ?? 3600)) * 1000,
  };
  return data.access_token;
}

async function resolveCategories(title: string, clientId: string, token: string) {
  const url = new URL("https://api.twitch.tv/helix/search/categories");
  url.searchParams.set("query", title);
  url.searchParams.set("first", "100");
  const response = await fetch(url, { headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Twitch category search failed: ${response.status} ${await response.text()}`);
  const payload = await response.json() as { data: TwitchCategory[] };
  const exact = payload.data.filter((item) => categoryMatchesTitle(item.name, title));
  return Array.from(new Map(exact.map((item) => [item.id, item])).values());
}

async function resolveGameCategories(title: string, aliases: string[], clientId: string, token: string) {
  const titleCategories = await resolveCategories(title, clientId, token);
  if (titleCategories.length) {
    return { categories: titleCategories, matchedPhrase: title, source: "title" as const };
  }

  for (const alias of uniqueAliases(title, aliases)) {
    const aliasCategories = await resolveCategories(alias, clientId, token);
    if (aliasCategories.length) {
      return { categories: aliasCategories, matchedPhrase: alias, source: "alias" as const };
    }
  }

  return { categories: [] as TwitchCategory[], matchedPhrase: null, source: null };
}

async function categoryNamesById(ids: string[], clientId: string, token: string) {
  const names = new Map<string, string>();
  for (const batch of chunks(Array.from(new Set(ids)), 100)) {
    if (!batch.length) continue;
    const url = new URL("https://api.twitch.tv/helix/games");
    batch.forEach((id) => url.searchParams.append("id", id));
    const response = await fetch(url, { headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Twitch category validation failed: ${response.status} ${await response.text()}`);
    const payload = await response.json() as { data: TwitchCategory[] };
    payload.data.forEach((item) => names.set(item.id, item.name));
  }
  return names;
}

function responseRateState(response: Response) {
  const remaining = Number.parseInt(response.headers.get("Ratelimit-Remaining") ?? "", 10);
  const reset = Number.parseInt(response.headers.get("Ratelimit-Reset") ?? "", 10);
  return {
    remaining: Number.isFinite(remaining) ? remaining : null,
    reset: Number.isFinite(reset) ? reset : null,
  };
}

async function streamsForCategoryGroup(
  categoryIds: string[],
  clientId: string,
  token: string,
  invocationStartedAt: number,
): Promise<StreamGroupResult> {
  const streamsByCategory = new Map<string, TwitchStream[]>();
  for (const id of categoryIds) streamsByCategory.set(id, []);

  let after: string | null = null;
  let pages = 0;
  let rateLimitRemaining: number | null = null;
  let rateLimitReset: number | null = null;

  do {
    if (Date.now() - invocationStartedAt >= TWITCH_INVOCATION_BUDGET_MS) {
      return {
        categoryIds,
        streamsByCategory,
        pages,
        complete: false,
        rateLimitRemaining,
        rateLimitReset,
        error: "Twitch invocation time budget reached before pagination completed.",
      };
    }

    if (rateLimitRemaining !== null && rateLimitRemaining <= TWITCH_RATE_LIMIT_FLOOR) {
      return {
        categoryIds,
        streamsByCategory,
        pages,
        complete: false,
        rateLimitRemaining,
        rateLimitReset,
        error: "Twitch rate-limit safety floor reached before pagination completed.",
      };
    }

    const url = new URL("https://api.twitch.tv/helix/streams");
    url.searchParams.set("first", "100");
    categoryIds.forEach((id) => url.searchParams.append("game_id", id));
    if (after) url.searchParams.set("after", after);

    const response = await fetch(url, { headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` } });
    const rateState = responseRateState(response);
    rateLimitRemaining = rateState.remaining;
    rateLimitReset = rateState.reset;

    if (!response.ok) {
      return {
        categoryIds,
        streamsByCategory,
        pages,
        complete: false,
        rateLimitRemaining,
        rateLimitReset,
        error: `Twitch streams failed: ${response.status} ${(await response.text()).slice(0, 1200)}`,
      };
    }

    const payload = await response.json() as { data: TwitchStream[]; pagination?: { cursor?: string } };
    for (const stream of payload.data) {
      const rows = streamsByCategory.get(stream.game_id);
      if (rows) rows.push(stream);
    }
    pages += 1;
    after = payload.pagination?.cursor ?? null;
  } while (after && pages < TWITCH_MAX_PAGES_PER_GROUP);

  return {
    categoryIds,
    streamsByCategory,
    pages,
    complete: !after,
    rateLimitRemaining,
    rateLimitReset,
    error: after ? `Twitch pagination exceeded ${TWITCH_MAX_PAGES_PER_GROUP} pages for a category group.` : null,
  };
}

async function fetchStreamGroupWithSplit(
  categoryIds: string[],
  clientId: string,
  token: string,
  invocationStartedAt: number,
): Promise<StreamGroupResult[]> {
  const result = await streamsForCategoryGroup(categoryIds, clientId, token, invocationStartedAt);
  if (result.complete || categoryIds.length <= 1) return [result];

  const canSplit = result.error?.includes("pagination exceeded") && Date.now() - invocationStartedAt < TWITCH_INVOCATION_BUDGET_MS;
  if (!canSplit) return [result];

  const middle = Math.ceil(categoryIds.length / 2);
  const left = await fetchStreamGroupWithSplit(categoryIds.slice(0, middle), clientId, token, invocationStartedAt);
  const right = await fetchStreamGroupWithSplit(categoryIds.slice(middle), clientId, token, invocationStartedAt);
  return [...left, ...right];
}

async function releaseClaims(supabase: ReturnType<typeof serviceClient>, games: Game[]) {
  if (!games.length) return;
  const { error } = await supabase
    .from("games")
    .update({ twitch_claimed_until: null })
    .in("id", games.map((game) => game.id));
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const invocationStartedAt = Date.now();

  try {
    const body = await request.json().catch(() => ({})) as { game_id?: string; healthcheck?: boolean };
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
    let games: Game[] = [];

    if (body.game_id) {
      const { data, error } = await supabase.from("games").select(GAME_SELECT).eq("id", body.game_id).eq("enabled", true).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Game not found or monitoring is paused." }, 404);
      const game = data as Game;

      if (!auth.internal && game.twitch_last_scanned_at) {
        const retryAt = new Date(new Date(game.twitch_last_scanned_at).getTime() + MANUAL_SCAN_COOLDOWN_MS);
        if (retryAt.getTime() > Date.now()) {
          return json({
            error: "Twitch manual scans are limited to one request every five minutes per game.",
            retry_at: retryAt.toISOString(),
          }, 429);
        }
      }

      if (game.twitch_claimed_until && new Date(game.twitch_claimed_until).getTime() > Date.now()) {
        return json({ error: "A Twitch scan for this game is already running. Try again shortly." }, 409);
      }

      const claimUntil = new Date(Date.now() + TWITCH_LEASE_SECONDS * 1000).toISOString();
      const { error: claimError } = await supabase.from("games").update({ twitch_claimed_until: claimUntil }).eq("id", game.id);
      if (claimError) throw claimError;
      games = [{ ...game, twitch_claimed_until: claimUntil }];
    } else {
      const configuredBatchSize = Number(Deno.env.get("TWITCH_GAMES_PER_RUN") ?? TWITCH_SCHEDULER_BATCH_SIZE);
      const claimLimit = Math.max(1, Math.min(250, Number.isFinite(configuredBatchSize) ? Math.round(configuredBatchSize) : TWITCH_SCHEDULER_BATCH_SIZE));
      const { data, error } = await supabase.rpc("claim_due_twitch_games", {
        p_limit: claimLimit,
        p_lease_seconds: TWITCH_LEASE_SECONDS,
      });
      if (error) throw error;
      games = (data ?? []) as Game[];
    }

    if (!games.length) return json({ ok: true, games: 0, mentions: 0 });

    const gameIds = games.map((game) => game.id);
    const { data: aliasData, error: aliasError } = await supabase
      .from("game_aliases")
      .select("game_id, phrase")
      .in("game_id", gameIds)
      .eq("type", "include");
    if (aliasError) throw aliasError;

    const aliasesByGame = new Map<string, string[]>();
    for (const alias of (aliasData ?? []) as GameAlias[]) {
      const aliases = aliasesByGame.get(alias.game_id) ?? [];
      aliases.push(alias.phrase);
      aliasesByGame.set(alias.game_id, aliases);
    }

    const token = await twitchToken(clientId, clientSecret);
    const staleGames = games.filter((game) => !categoryCacheFresh(game));
    const staleCachedIds = staleGames.flatMap((game) => game.twitch_category_ids ?? []);
    const validatedCategoryNames = await categoryNamesById(staleCachedIds, clientId, token);

    const prepared: PreparedGame[] = [];
    const noCategoryGames: Game[] = [];

    const preparedResults = await mapLimit(games, 8, async (game) => {
      const aliases = aliasesByGame.get(game.id) ?? [];
      const allowedNames = allowedCategoryNames(game, aliases);

      if (categoryCacheFresh(game)) {
        return {
          game,
          categories: game.twitch_category_ids.map((id, index) => ({ id, name: game.twitch_category_names[index] ?? id })),
          source: "cached" as const,
          phrase: null,
          refreshCacheTimestamp: false,
        };
      }

      const cachedCategories = (game.twitch_category_ids ?? [])
        .map((id) => ({ id, name: validatedCategoryNames.get(id) }))
        .filter((item): item is { id: string; name: string } => Boolean(item.name))
        .filter((item) => allowedNames.some((name) => categoryMatchesTitle(item.name, name)));

      if (cachedCategories.length === (game.twitch_category_ids ?? []).length && cachedCategories.length > 0) {
        return {
          game,
          categories: cachedCategories,
          source: "cached" as const,
          phrase: null,
          refreshCacheTimestamp: true,
        };
      }

      const resolved = await resolveGameCategories(game.title, aliases, clientId, token);
      return {
        game,
        categories: resolved.categories,
        source: resolved.source ?? "cached" as const,
        phrase: resolved.matchedPhrase,
        refreshCacheTimestamp: true,
      };
    });

    for (const result of preparedResults) {
      const categoryIds = Array.from(new Set(result.categories.map((item) => item.id)));
      const categoryNames = categoryIds.map((id) => result.categories.find((item) => item.id === id)?.name ?? id);

      if (!categoryIds.length) {
        noCategoryGames.push(result.game);
        const nextRetry = new Date(Date.now() + TWITCH_NO_CATEGORY_BACKOFF_MS).toISOString();
        const [gameUpdate, scanRun] = await Promise.all([
          supabase.from("games").update({
            twitch_game_id: null,
            twitch_category_ids: [],
            twitch_category_names: [],
            twitch_category_checked_at: new Date().toISOString(),
            twitch_claimed_until: null,
            twitch_next_scan_at: nextRetry,
          }).eq("id", result.game.id),
          supabase.from("scan_runs").insert({
            game_id: result.game.id,
            platform: "twitch",
            status: "failed",
            finished_at: new Date().toISOString(),
            error: "No matching Twitch category for title or aliases.",
            metadata: {
              category_candidates: allowedCategoryNames(result.game, aliasesByGame.get(result.game.id) ?? []),
              retry_at: nextRetry,
            },
          }),
        ]);
        if (gameUpdate.error) throw gameUpdate.error;
        if (scanRun.error) throw scanRun.error;
        continue;
      }

      if (result.refreshCacheTimestamp || result.game.twitch_game_id !== categoryIds[0]) {
        const { error: cacheError } = await supabase.from("games").update({
          twitch_game_id: categoryIds[0],
          twitch_category_ids: categoryIds,
          twitch_category_names: categoryNames,
          twitch_category_checked_at: new Date().toISOString(),
        }).eq("id", result.game.id);
        if (cacheError) throw cacheError;
      }

      prepared.push({
        ...result.game,
        twitch_game_id: categoryIds[0],
        twitch_category_ids: categoryIds,
        twitch_category_names: categoryNames,
        categoryIds,
        categoryNames,
        matchSource: result.source,
        matchPhrase: result.phrase,
      });
    }

    if (!prepared.length) {
      return json({ ok: true, games: games.length, prepared: 0, mentions: 0, no_category: noCategoryGames.length });
    }

    const workspaceIds = Array.from(new Set(prepared.map((game) => game.workspace_id)));
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from("subscriptions")
      .select("workspace_id, plan, status")
      .in("workspace_id", workspaceIds);
    if (subscriptionsError) throw subscriptionsError;

    const planByWorkspace = new Map((subscriptions ?? []).map((item) => [
      item.workspace_id as string,
      (item.status === "active" || item.status === "trialing" ? item.plan : "free") as Plan,
    ]));

    const gamesByCategoryId = new Map<string, PreparedGame[]>();
    for (const game of prepared) {
      for (const categoryId of game.categoryIds) {
        const tracked = gamesByCategoryId.get(categoryId) ?? [];
        tracked.push(game);
        gamesByCategoryId.set(categoryId, tracked);
      }
    }

    const uniqueCategoryIds = Array.from(gamesByCategoryId.keys());
    const initialGroups = chunks(uniqueCategoryIds, TWITCH_CATEGORY_GROUP_SIZE);
    const groupResults: StreamGroupResult[] = [];

    for (const group of initialGroups) {
      if (Date.now() - invocationStartedAt >= TWITCH_INVOCATION_BUDGET_MS) break;
      const results = await fetchStreamGroupWithSplit(group, clientId, token, invocationStartedAt);
      groupResults.push(...results);
      const last = results[results.length - 1];
      if (last?.rateLimitRemaining !== null && last.rateLimitRemaining <= TWITCH_RATE_LIMIT_FLOOR) break;
    }

    const streamsByCategory = new Map<string, TwitchStream[]>();
    const completedCategories = new Set<string>();
    const pagesByCategory = new Map<string, number>();
    const rateRemainingByCategory = new Map<string, number | null>();
    const errorsByCategory = new Map<string, string>();

    for (const result of groupResults) {
      for (const categoryId of result.categoryIds) {
        streamsByCategory.set(categoryId, result.streamsByCategory.get(categoryId) ?? []);
        pagesByCategory.set(categoryId, result.pages);
        rateRemainingByCategory.set(categoryId, result.rateLimitRemaining);
        if (result.complete) completedCategories.add(categoryId);
        else errorsByCategory.set(categoryId, result.error ?? "Twitch category scan did not complete.");
      }
    }

    let upserted = 0;
    let completedGames = 0;
    let deferredGames = 0;
    const finishedAt = new Date();

    for (const game of prepared) {
      const streamById = new Map<string, TwitchStream>();
      for (const categoryId of game.categoryIds) {
        for (const stream of streamsByCategory.get(categoryId) ?? []) streamById.set(stream.id, stream);
      }

      const rows = Array.from(streamById.values()).map((stream) => ({
        game_id: game.id,
        platform: "twitch",
        external_id: stream.id,
        creator_external_id: stream.user_id,
        creator_name: stream.user_name,
        title: stream.title || `${stream.user_name} is live`,
        url: `https://www.twitch.tv/${stream.user_login}`,
        thumbnail_url: stream.thumbnail_url.replace("{width}", "640").replace("{height}", "360"),
        viewer_count: stream.viewer_count,
        language: stream.language,
        published_at: stream.started_at,
        last_seen_at: finishedAt.toISOString(),
        signal_score: signalScore(stream.viewer_count, true),
        raw_payload: stream,
      }));

      for (const batch of chunks(rows, TWITCH_UPSERT_BATCH_SIZE)) {
        const { error: upsertError } = await supabase
          .from("mentions")
          .upsert(batch, { onConflict: "game_id,platform,external_id" });
        if (upsertError) throw upsertError;
        upserted += batch.length;
      }

      const complete = game.categoryIds.every((id) => completedCategories.has(id));
      const plan = planByWorkspace.get(game.workspace_id) ?? "free";
      const nextDueAt = complete
        ? new Date(finishedAt.getTime() + twitchCadenceMinutes(plan) * 60_000).toISOString()
        : new Date(finishedAt.getTime() + 60_000).toISOString();
      const categoryErrors = game.categoryIds.map((id) => errorsByCategory.get(id)).filter(Boolean);

      const [gameUpdate, scanRun] = await Promise.all([
        supabase.from("games").update({
          twitch_claimed_until: null,
          twitch_next_scan_at: nextDueAt,
          ...(complete ? { twitch_last_scanned_at: finishedAt.toISOString() } : {}),
        }).eq("id", game.id),
        supabase.from("scan_runs").insert({
          game_id: game.id,
          platform: "twitch",
          status: complete ? "success" : "failed",
          finished_at: finishedAt.toISOString(),
          results_count: rows.length,
          error: complete ? null : (categoryErrors[0] ?? "Twitch scan deferred because its category batch did not complete."),
          metadata: {
            twitch_game_id: game.twitch_game_id,
            twitch_category_ids: game.categoryIds,
            twitch_category_names: game.categoryNames,
            twitch_category_match_source: game.matchSource,
            twitch_category_match_phrase: game.matchPhrase,
            twitch_stream_pages_by_category: Object.fromEntries(game.categoryIds.map((id) => [id, pagesByCategory.get(id) ?? 0])),
            twitch_rate_limit_remaining_by_category: Object.fromEntries(game.categoryIds.map((id) => [id, rateRemainingByCategory.get(id) ?? null])),
            twitch_stream_results_truncated: !complete,
            category_errors: categoryErrors,
            retry_at: complete ? null : nextDueAt,
          },
        }),
      ]);
      if (gameUpdate.error) throw gameUpdate.error;
      if (scanRun.error) throw scanRun.error;

      if (complete) completedGames += 1;
      else deferredGames += 1;
    }

    const unprocessedGames = prepared.filter((game) => game.categoryIds.some((id) => !streamsByCategory.has(id)));
    if (unprocessedGames.length) await releaseClaims(supabase, unprocessedGames);

    return json({
      ok: deferredGames === 0,
      games: games.length,
      prepared: prepared.length,
      completed_games: completedGames,
      deferred_games: deferredGames,
      no_category: noCategoryGames.length,
      unique_categories: uniqueCategoryIds.length,
      mentions: upserted,
      execution_ms: Date.now() - invocationStartedAt,
    }, deferredGames === 0 ? 200 : 207);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return json({ error: message }, status);
  }
});
