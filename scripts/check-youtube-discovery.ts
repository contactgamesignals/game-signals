import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

console.log("YouTube discovery, pagination and quota-decoupling safeguards are present.");
