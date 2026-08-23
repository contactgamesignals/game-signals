import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const youtube = read("supabase/functions/scan-youtube/index.ts");
const twitch = read("supabase/functions/scan-twitch/index.ts");
const discord = read("supabase/functions/notify-discord/index.ts");
const email = read("supabase/functions/notify-email/index.ts");
const dashboard = read("app/dashboard/page.tsx");
const migration = [
  read("supabase/migrations/20260823184000_scale_monitoring_to_1000_games.sql"),
  read("supabase/migrations/20260823184500_scale_digest_claims_and_quota_day.sql"),
  read("supabase/migrations/20260823185000_scale_digest_by_destination.sql"),
].join("\n");

const TARGET_ACTIVE_GAMES = 1000;
const YOUTUBE_CADENCE_MINUTES = 30;
const YOUTUBE_TARGET_SEARCH_DAILY_BUDGET = 100_000;
const YOUTUBE_WORKER_PAGE_CAPACITY_PER_MINUTE = 80;
const TWITCH_CADENCE_MINUTES = 10;
const TWITCH_WORKER_GAME_CAPACITY_PER_MINUTE = 120;

const youtubeBaseSearchCallsPerDay = TARGET_ACTIVE_GAMES * (24 * 60 / YOUTUBE_CADENCE_MINUTES);
const youtubeWorkerCapacityPerDay = YOUTUBE_WORKER_PAGE_CAPACITY_PER_MINUTE * 24 * 60;
const youtubePagesPerScheduledScanBudget = YOUTUBE_TARGET_SEARCH_DAILY_BUDGET / youtubeBaseSearchCallsPerDay;
const twitchGamesDuePerMinute = TARGET_ACTIVE_GAMES / TWITCH_CADENCE_MINUTES;

if (youtubeBaseSearchCallsPerDay !== 48_000) throw new Error("Unexpected YouTube capacity math.");
if (youtubeWorkerCapacityPerDay < YOUTUBE_TARGET_SEARCH_DAILY_BUDGET) {
  throw new Error(`YouTube worker throughput ${youtubeWorkerCapacityPerDay}/day is below the target quota budget ${YOUTUBE_TARGET_SEARCH_DAILY_BUDGET}/day.`);
}
if (youtubePagesPerScheduledScanBudget < 2) {
  throw new Error("YouTube target quota leaves less than two search pages per scheduled game scan on average.");
}
if (TWITCH_WORKER_GAME_CAPACITY_PER_MINUTE < twitchGamesDuePerMinute) {
  throw new Error(`Twitch worker can claim ${TWITCH_WORKER_GAME_CAPACITY_PER_MINUTE}/min but ${twitchGamesDuePerMinute}/min are due at 1000 active games.`);
}

const requiredYoutube = [
  "const YOUTUBE_SCHEDULER_BATCH_SIZE = 80;",
  "claim_due_youtube_games",
  "reserve_monitoring_quota",
  "youtube_scan_page_token",
  "youtube_scan_window_start",
  "youtube_scan_window_end",
  "publishedBefore",
  "pageToken",
  "pagination_in_progress",
  "youtube_last_revalidated_at",
  "YOUTUBE_REVALIDATE_EVERY_MS",
  "fetchVideoDetailsBatched",
  "YOUTUBE_DETAILS_CONCURRENCY",
];

const requiredTwitch = [
  "const TWITCH_SCHEDULER_BATCH_SIZE = 120;",
  "claim_due_twitch_games",
  "twitch_category_ids",
  "twitch_category_checked_at",
  "TWITCH_CATEGORY_CACHE_MS",
  "TWITCH_CATEGORY_GROUP_SIZE",
  "url.searchParams.append(\"game_id\", id)",
  "fetchStreamGroupWithSplit",
  "TWITCH_RATE_LIMIT_FLOOR",
  "TWITCH_INVOCATION_BUDGET_MS",
];

const requiredDiscord = [
  "claim_discord_deliveries",
  "complete_discord_delivery",
  "DISCORD_QUEUE_BATCH_SIZE",
  "DISCORD_DESTINATION_CONCURRENCY",
  "response.status === 429",
];

const requiredEmail = [
  "prepare_email_digest_period",
  "claim_email_digest_destinations",
  "email_digest_channels_for_destination",
  "email_digest_workspace_summary",
  "complete_email_digest_destination",
  "EMAIL_DESTINATIONS_PER_RUN",
];

const requiredMigration = [
  "mentions_workspace_platform_detected_idx",
  "claim_due_youtube_games",
  "claim_due_twitch_games",
  "private.api_quota_usage",
  "youtube_search_daily_budget",
  "America/Los_Angeles",
  "mentions_enqueue_discord_after_insert",
  "claim_discord_deliveries",
  "daily_digest_destination_deliveries",
  "cleanup_monitoring_internal_data",
];

for (const snippet of requiredYoutube) {
  if (!youtube.includes(snippet)) throw new Error(`1000-game regression: YouTube is missing ${snippet}`);
}
for (const snippet of requiredTwitch) {
  if (!twitch.includes(snippet)) throw new Error(`1000-game regression: Twitch is missing ${snippet}`);
}
for (const snippet of requiredDiscord) {
  if (!discord.includes(snippet)) throw new Error(`1000-game regression: Discord is missing ${snippet}`);
}
for (const snippet of requiredEmail) {
  if (!email.includes(snippet)) throw new Error(`1000-game regression: email digest is missing ${snippet}`);
}
for (const snippet of requiredMigration) {
  if (!migration.includes(snippet)) throw new Error(`1000-game regression: migrations are missing ${snippet}`);
}

if (!dashboard.includes('.eq("workspace_id", workspaceId)')) {
  throw new Error("1000-game regression: dashboard mention queries must filter directly by workspace_id.");
}

const forbidden = [
  [youtube, 'searchUrl.searchParams.set("maxResults", "25")', "YouTube 25-result cap"],
  [youtube, '.limit(10)', "YouTube ten-game scheduler cap"],
  [discord, '.limit(500)', "Discord latest-500 polling"],
  [email, "MAX_MENTIONS_PER_DIGEST_WINDOW", "global email mention cap"],
] as const;

for (const [source, snippet, label] of forbidden) {
  if (source.includes(snippet)) throw new Error(`1000-game regression: ${label} returned.`);
}

console.log(JSON.stringify({
  target_active_games: TARGET_ACTIVE_GAMES,
  youtube: {
    cadence_minutes: YOUTUBE_CADENCE_MINUTES,
    base_search_calls_per_day: youtubeBaseSearchCallsPerDay,
    required_external_search_quota_target_per_day: YOUTUBE_TARGET_SEARCH_DAILY_BUDGET,
    average_search_pages_available_per_scan_at_target: Number(youtubePagesPerScheduledScanBudget.toFixed(2)),
    worker_page_capacity_per_day: youtubeWorkerCapacityPerDay,
  },
  twitch: {
    cadence_minutes: TWITCH_CADENCE_MINUTES,
    games_due_per_minute: twitchGamesDuePerMinute,
    worker_game_claim_capacity_per_minute: TWITCH_WORKER_GAME_CAPACITY_PER_MINUTE,
  },
  note: "The 100000/day YouTube Search Queries quota is an external capacity target and must be approved in Google Cloud before 1000 games can meet the 30-minute cadence.",
}, null, 2));
