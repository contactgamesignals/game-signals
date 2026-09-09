import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prioritizeYouTubeQuotaCandidates } from "../supabase/functions/_shared/youtube-scheduling.ts";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/scan-youtube/index.ts"), "utf8");
const matching = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/youtube-matching.ts"), "utf8");

const requiredSnippets = [
  "const YOUTUBE_SEARCH_PAGE_SIZE = 50;",
  "searchUrl.searchParams.set(\"videoCategoryId\", \"20\");",
  "searchUrl.searchParams.set(\"safeSearch\", \"none\");",
  "searchUrl.searchParams.set(\"maxResults\", String(YOUTUBE_SEARCH_PAGE_SIZE));",
  "searchUrl.searchParams.set(\"publishedBefore\", prepared.windowEnd);",
  "searchUrl.searchParams.set(\"pageToken\", prepared.pageToken);",
  "youtube_category_id: \"20\"",
  "pagination_in_progress: Boolean(nextPageToken)",
  "candidate_count: payload.items?.length ?? 0",
  "queue_delay_minutes: prepared.queueDelayMinutes",
  "scan_interval_minutes: prepared.scanIntervalMinutes",
  "claim_due_youtube_games",
  "reserve_monitoring_quota",
  "classifyYouTubeSearchCandidate",
  "enqueue_youtube_detail_candidates",
  "claim_youtube_detail_candidates",
  "complete_youtube_detail_candidates",
  "fetchVideoDetailsBatched",
  "videos:batchGetStats",
  "youtube_stats",
  "youtube_last_revalidated_at",
  "if (aliasError) throw aliasError;",
  "if (subscriptionError) throw subscriptionError;",
  "if (upsertError) throw upsertError;",
  "YouTube video details failed:",
];

for (const snippet of requiredSnippets) {
  if (!source.includes(snippet)) {
    throw new Error(`YouTube discovery regression: missing required safeguard: ${snippet}`);
  }
}

const matchingRequired = [
  'export type YouTubeCandidateDecision = "accept" | "needs_detail" | "reject";',
  "classifyYouTubeSearchCandidate",
  "matchesYouTubeTrackedGame",
  'if (excludes.length) return "needs_detail";',
];
for (const snippet of matchingRequired) {
  if (!matching.includes(snippet)) {
    throw new Error(`YouTube matching regression: missing required safeguard: ${snippet}`);
  }
}

const forbiddenSnippets = [
  "YOUTUBE_GAMING_TOPIC_ID",
  "searchUrl.searchParams.set(\"topicId\"",
  "searchUrl.searchParams.set(\"maxResults\", \"25\")",
  "const YOUTUBE_SCHEDULER_BATCH_SIZE = 1;",
  "const allCandidateIds =",
  "detailGranted < detailCallsNeeded",
  "YouTube general quota pacing deferred video details. The same search window will be retried.",
];

for (const snippet of forbiddenSnippets) {
  if (source.includes(snippet)) {
    throw new Error(`YouTube discovery regression: forbidden behavior is present: ${snippet}`);
  }
}

const prioritized = prioritizeYouTubeQuotaCandidates([
  { id: "b", youtube_next_scan_at: "2026-09-09T21:00:00Z", youtube_scan_page_token: null },
  { id: "c", youtube_next_scan_at: "2026-09-09T19:00:00Z", youtube_scan_page_token: null },
  { id: "a", youtube_next_scan_at: "2026-09-09T22:00:00Z", youtube_scan_page_token: "next-page" },
  { id: "d", youtube_next_scan_at: "2026-09-09T19:00:00Z", youtube_scan_page_token: null },
]);

const prioritizedIds = prioritized.map((game) => game.id).join(",");
if (prioritizedIds !== "a,c,d,b") {
  throw new Error(`YouTube quota fairness regression: unexpected priority order: ${prioritizedIds}`);
}

if (!source.includes("games = prioritizeYouTubeQuotaCandidates(games);")) {
  throw new Error("YouTube quota fairness regression: claimed games are not sorted before quota slicing.");
}

console.log("YouTube discovery, pagination and quota-decoupling safeguards are present.");
