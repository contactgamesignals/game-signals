import { authorizeRequest, json, jsonHeaders, serviceClient } from "../_shared/core.ts";

type DeliveryJob = {
  mention_id: string;
  notification_channel_id: string;
  destination: string;
  platform: "youtube" | "twitch";
  creator_name: string;
  content_title: string;
  content_url: string;
  thumbnail_url: string | null;
  viewer_count: number | null;
  view_count: number | null;
  detected_at: string;
  game_title: string;
  workspace_id: string;
  attempts: number;
};

const DASHBOARD_URL = "https://www.whoplaysmygame.com/dashboard";
const DISCORD_QUEUE_BATCH_SIZE = 250;
const DISCORD_DESTINATION_CONCURRENCY = 6;
const DISCORD_INVOCATION_BUDGET_MS = 90_000;
const MAX_INLINE_RATE_LIMIT_WAIT_MS = 5_000;

function trimText(value: string, max: number) {
  const normalized = value.trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function escapeDiscordMarkdown(value: string) {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>~])/g, "\\$1");
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(value)));
}

function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function discordRelativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Just now";
  return `<t:${Math.floor(timestamp / 1000)}:R>`;
}

function buildDiscordEmbed(job: DeliveryJob) {
  const isYouTube = job.platform === "youtube";
  const platformName = isYouTube ? "YouTube" : "Twitch";
  const platformEmoji = isYouTube ? "🔴" : "🟣";
  const color = isYouTube ? 0xff0033 : 0x9146ff;
  const reach = job.view_count ?? job.viewer_count ?? 0;
  const mediaUrl = safeHttpUrl(job.content_url);
  const thumbnailUrl = safeHttpUrl(job.thumbnail_url);
  const rawCreatorName = trimText(job.creator_name || "Unknown creator", 120);
  const rawGameTitle = trimText(job.game_title, 120);
  const rawContentTitle = trimText(job.content_title || `${rawCreatorName} on ${platformName}`, 300);
  const creatorName = escapeDiscordMarkdown(rawCreatorName);
  const gameTitle = escapeDiscordMarkdown(rawGameTitle);
  const contentTitle = escapeDiscordMarkdown(rawContentTitle);

  const title = isYouTube
    ? `${platformEmoji} New YouTube video detected`
    : `${platformEmoji} ${rawCreatorName} is LIVE on Twitch`;

  const description = isYouTube
    ? `**${contentTitle}**\n\n**${creatorName}** published a new video matching **${gameTitle}**.`
    : `**${contentTitle}**\n\n**${creatorName}** just went live with **${gameTitle}**.`;

  const fields = [
    { name: "🎮 Game", value: `**${gameTitle}**`, inline: true },
    { name: "👤 Creator", value: `**${creatorName}**`, inline: true },
    {
      name: isYouTube ? "👁️ Views" : "👥 Live viewers",
      value: `**${formatCount(reach)}**`,
      inline: true,
    },
    {
      name: "🕒 Detected",
      value: discordRelativeTime(job.detected_at),
      inline: true,
    },
  ];

  const links = [`[Open dashboard](${DASHBOARD_URL})`];
  if (mediaUrl) links.unshift(`[${isYouTube ? "▶ Watch on YouTube" : "▶ Watch on Twitch"}](${mediaUrl})`);
  fields.push({ name: "🔗 Quick links", value: links.join("  •  "), inline: false });

  return {
    author: {
      name: `Who Plays My Game · ${platformName} alert`,
      url: DASHBOARD_URL,
    },
    title: trimText(title, 256),
    description,
    url: mediaUrl ?? DASHBOARD_URL,
    color,
    fields,
    image: thumbnailUrl ? { url: thumbnailUrl } : undefined,
    footer: { text: `Who Plays My Game • ${platformName} creator monitoring` },
    timestamp: job.detected_at,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterSeconds(response: Response, bodyText: string) {
  const headerSeconds = Number(response.headers.get("Retry-After"));
  if (Number.isFinite(headerSeconds) && headerSeconds > 0) return Math.ceil(headerSeconds);

  try {
    const payload = JSON.parse(bodyText) as { retry_after?: number };
    const value = Number(payload.retry_after ?? 0);
    if (Number.isFinite(value) && value > 0) return Math.max(1, Math.ceil(value));
  } catch {
    // Discord may return non-JSON errors. Use the normal retry below.
  }
  return 60;
}

async function completeDelivery(
  supabase: ReturnType<typeof serviceClient>,
  job: DeliveryJob,
  success: boolean,
  error: string | null,
  retryAfter: number,
) {
  const { error: rpcError } = await supabase.rpc("complete_discord_delivery", {
    p_mention_id: job.mention_id,
    p_notification_channel_id: job.notification_channel_id,
    p_success: success,
    p_error: error,
    p_retry_after_seconds: retryAfter,
  });
  if (rpcError) throw rpcError;
}

async function deferRateLimitedDelivery(
  supabase: ReturnType<typeof serviceClient>,
  job: DeliveryJob,
  error: string,
  retryAfter: number,
) {
  const { error: rpcError } = await supabase.rpc("defer_discord_rate_limited_delivery", {
    p_mention_id: job.mention_id,
    p_notification_channel_id: job.notification_channel_id,
    p_error: error,
    p_retry_after_seconds: retryAfter,
  });
  if (rpcError) throw rpcError;
}

async function processDestination(
  supabase: ReturnType<typeof serviceClient>,
  jobs: DeliveryJob[],
  invocationStartedAt: number,
) {
  let delivered = 0;
  let failed = 0;
  let rateLimited = 0;

  for (const job of jobs) {
    if (Date.now() - invocationStartedAt >= DISCORD_INVOCATION_BUDGET_MS) break;

    let response: Response;
    let responseText = "";
    try {
      response = await fetch(job.destination, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": Deno.env.get("DISCORD_USER_AGENT") ?? "WhoPlaysMyGame/0.1",
        },
        body: JSON.stringify({
          username: "Who Plays My Game",
          allowed_mentions: { parse: [] },
          embeds: [buildDiscordEmbed(job)],
        }),
      });
      if (!response.ok) responseText = (await response.text()).slice(0, 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await completeDelivery(supabase, job, false, message, 60);
      failed += 1;
      continue;
    }

    if (response.ok) {
      await completeDelivery(supabase, job, true, null, 0);
      delivered += 1;
      continue;
    }

    if (response.status === 429) {
      const retryAfter = retryAfterSeconds(response, responseText);
      await deferRateLimitedDelivery(supabase, job, responseText || "Discord rate limited the webhook.", retryAfter);
      rateLimited += 1;
      if (retryAfter * 1000 <= MAX_INLINE_RATE_LIMIT_WAIT_MS && Date.now() - invocationStartedAt + retryAfter * 1000 < DISCORD_INVOCATION_BUDGET_MS) {
        await sleep(retryAfter * 1000 + 100);
      }
      continue;
    }

    const retryAfter = response.status >= 500 ? 60 : 300;
    await completeDelivery(supabase, job, false, responseText || `Discord rejected the webhook (${response.status}).`, retryAfter);
    failed += 1;
  }

  return { delivered, failed, rateLimited };
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const invocationStartedAt = Date.now();

  try {
    const auth = await authorizeRequest(request);
    if (!auth.internal) return json({ error: "Discord delivery is an internal worker." }, 403);

    const supabase = serviceClient();
    const { data, error } = await supabase.rpc("claim_discord_deliveries", {
      p_limit: DISCORD_QUEUE_BATCH_SIZE,
      p_lease_seconds: 120,
    });
    if (error) throw error;

    const jobs = (data ?? []) as DeliveryJob[];
    if (!jobs.length) return json({ ok: true, claimed: 0, delivered: 0, failed: 0, rate_limited: 0 });

    const byDestination = new Map<string, DeliveryJob[]>();
    for (const job of jobs) {
      const destinationJobs = byDestination.get(job.destination) ?? [];
      destinationJobs.push(job);
      byDestination.set(job.destination, destinationJobs);
    }

    const groups = Array.from(byDestination.values());
    const results = await mapLimit(groups, DISCORD_DESTINATION_CONCURRENCY, (group) => processDestination(supabase, group, invocationStartedAt));

    const delivered = results.reduce((sum, result) => sum + result.delivered, 0);
    const failed = results.reduce((sum, result) => sum + result.failed, 0);
    const rateLimited = results.reduce((sum, result) => sum + result.rateLimited, 0);

    return json({
      ok: true,
      claimed: jobs.length,
      delivered,
      failed,
      rate_limited: rateLimited,
      destinations: groups.length,
      execution_ms: Date.now() - invocationStartedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === "Unauthorized" ? 401 : 500);
  }
});
