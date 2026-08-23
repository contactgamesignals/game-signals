import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/scan-youtube/index.ts"), "utf8");

const requiredSnippets = [
  "const YOUTUBE_SEARCH_PAGE_SIZE = 50;",
  "searchUrl.searchParams.set(\"videoCategoryId\", \"20\");",
  "searchUrl.searchParams.set(\"safeSearch\", \"none\");",
  "searchUrl.searchParams.set(\"maxResults\", String(YOUTUBE_SEARCH_PAGE_SIZE));",
  "youtube_category_id: \"20\"",
  "search_has_next_page: searchHasNextPage",
  "search_results_truncated: searchHasNextPage",
  "candidate_count: items.length",
  "queue_delay_minutes: queueDelayMinutes",
  "scan_interval_minutes: scanIntervalMinutes",
  "if (aliasesError) throw aliasesError;",
  "if (subscriptionError) throw subscriptionError;",
  "if (upsertError) throw upsertError;",
  "YouTube video details failed:",
];

for (const snippet of requiredSnippets) {
  if (!source.includes(snippet)) {
    throw new Error(`YouTube discovery regression: missing required safeguard: ${snippet}`);
  }
}

const forbiddenSnippets = [
  "YOUTUBE_GAMING_TOPIC_ID",
  "searchUrl.searchParams.set(\"topicId\"",
  "if (!detailsResponse.ok) continue;",
  "searchUrl.searchParams.set(\"maxResults\", \"25\")",
];

for (const snippet of forbiddenSnippets) {
  if (source.includes(snippet)) {
    throw new Error(`YouTube discovery regression: forbidden behavior is present: ${snippet}`);
  }
}

console.log("YouTube discovery safeguards are present.");
