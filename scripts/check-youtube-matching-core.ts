import assert from "node:assert/strict";
import {
  classifyYouTubeSearchCandidate,
  matchesYouTubeTrackedGame,
  type YouTubeSearchItem,
} from "../supabase/functions/_shared/youtube-matching.ts";

function item(title: string, description = ""): YouTubeSearchItem {
  return {
    id: { videoId: `video-${title.replace(/\W+/g, "-").toLowerCase()}` },
    snippet: {
      publishedAt: "2026-08-23T12:00:00Z",
      channelId: "channel-1",
      title,
      channelTitle: "Creator",
      description,
    },
  };
}

assert.equal(
  classifyYouTubeSearchCandidate(item("AFTERBLAST gameplay - first run"), ["AFTERBLAST"], []),
  "accept",
  "A clear single-token game title with strong gaming context should not spend general quota.",
);

assert.equal(
  classifyYouTubeSearchCandidate(item("Hades gameplay - first run"), ["Hades"], []),
  "accept",
  "A single-word title with strong gameplay context should be accepted from the search snippet.",
);

assert.equal(
  classifyYouTubeSearchCandidate(item("Hades"), ["Hades"], []),
  "needs_detail",
  "A bare single-word title should be validated with full metadata instead of guessed.",
);

assert.equal(
  classifyYouTubeSearchCandidate(item("My first roguelite run", "Found this hidden gem"), ["Hades"], []),
  "needs_detail",
  "A search result whose game phrase is only in hidden metadata must stay recoverable through the detail queue.",
);

assert.equal(
  classifyYouTubeSearchCandidate(item("AFTERBLAST gameplay", "Minecraft challenge"), ["AFTERBLAST"], []),
  "needs_detail",
  "An ambiguous single-token title with a foreign-game anchor should require full metadata validation.",
);

assert.equal(
  matchesYouTubeTrackedGame(item("AFTERBLAST gameplay", "Minecraft challenge"), {
    views: 100,
    categoryId: "20",
    description: "Minecraft challenge gameplay",
    tags: ["Minecraft"],
  }, ["AFTERBLAST"], []),
  false,
  "Full metadata must reject a foreign-game anchor when mixed coverage is not explicit.",
);

assert.equal(
  classifyYouTubeSearchCandidate(item("AFTERBLAST vs Minecraft gameplay"), ["AFTERBLAST"], []),
  "accept",
  "Explicit mixed coverage should remain eligible.",
);

assert.equal(
  classifyYouTubeSearchCandidate(item("AFTERBLAST gameplay", "Official trailer"), ["AFTERBLAST"], ["official"]),
  "reject",
  "An exclusion visible in the snippet must reject the result immediately.",
);

assert.equal(
  classifyYouTubeSearchCandidate(item("AFTERBLAST gameplay"), ["AFTERBLAST"], ["sponsored"]),
  "needs_detail",
  "Configured exclusions must force full metadata validation when the exclusion is not visible in the snippet.",
);

const ambiguous = item("Hades");
assert.equal(
  matchesYouTubeTrackedGame(ambiguous, {
    views: 123,
    categoryId: "20",
    description: "Hades gameplay run",
    tags: ["Hades", "roguelite"],
  }, ["Hades"], []),
  true,
  "Full metadata must recover a valid ambiguous single-word match.",
);

assert.equal(
  matchesYouTubeTrackedGame(item("AFTERBLAST gameplay"), {
    views: 123,
    categoryId: "20",
    description: "Sponsored creator coverage",
    tags: ["AFTERBLAST", "sponsored"],
  }, ["AFTERBLAST"], ["sponsored"]),
  false,
  "Full metadata exclusions must remain authoritative.",
);

assert.equal(
  matchesYouTubeTrackedGame(item("AFTERBLAST gameplay"), {
    views: 123,
    categoryId: "22",
    description: "AFTERBLAST gameplay",
    tags: ["AFTERBLAST"],
  }, ["AFTERBLAST"], []),
  false,
  "Detailed validation must still require YouTube Gaming category 20.",
);

console.log("YouTube snippet-first matching regression passed.");
