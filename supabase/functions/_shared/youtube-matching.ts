export type YouTubeSearchItem = {
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

export type YouTubeVideoDetail = {
  views: number;
  categoryId: string | null;
  description: string;
  tags: string[];
};

export type YouTubeCandidateDecision = "accept" | "needs_detail" | "reject";

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

export function normalizeYouTubeWords(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsYouTubePhrase(value: string, phrase: string) {
  const haystack = normalizeYouTubeWords(value);
  const needle = normalizeYouTubeWords(phrase);
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

export function youtubeWordCount(value: string) {
  const normalized = normalizeYouTubeWords(value);
  return normalized ? normalized.split(" ").length : 0;
}

function phraseOccurrences(value: string, phrase: string) {
  const haystack = ` ${normalizeYouTubeWords(value)} `;
  const needle = normalizeYouTubeWords(phrase);
  if (!needle) return 0;
  return Math.max(0, haystack.split(` ${needle} `).length - 1);
}

function exactHashtagMatch(value: string, phrase: string) {
  const needle = normalizeYouTubeWords(phrase);
  if (!needle || needle.includes(" ")) return false;
  for (const match of value.matchAll(/#([\p{L}\p{N}_-]+)/gu)) {
    if (normalizeYouTubeWords(match[1] ?? "") === needle) return true;
  }
  return false;
}

function exactTagMatch(tags: string[], phrase: string) {
  const needle = normalizeYouTubeWords(phrase);
  return tags.some((tag) => normalizeYouTubeWords(tag) === needle);
}

function hasStrongGameContext(value: string) {
  return STRONG_GAME_CONTEXT_HINTS.some((hint) => containsYouTubePhrase(value, hint));
}

function hasForeignGameAnchor(value: string, includes: string[]) {
  return OTHER_GAME_ANCHORS.some((anchor) => {
    if (!containsYouTubePhrase(value, anchor)) return false;
    return !includes.some((include) => containsYouTubePhrase(include, anchor) || containsYouTubePhrase(anchor, include));
  });
}

function explicitMixedCoverage(title: string) {
  const normalized = ` ${normalizeYouTubeWords(title)} `;
  return title.includes("+") || title.includes("&") || /\bvs\.?\b/i.test(title) || normalized.includes(" versus ") || normalized.includes(" and ");
}

function gameTitleSyntax(title: string, phrase: string) {
  const normalizedTitle = normalizeYouTubeWords(title);
  const needle = normalizeYouTubeWords(phrase);
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

function singleWordSnippetLooksIntentional(item: YouTubeSearchItem, phrase: string, snippetContext: string, includes: string[]) {
  const title = item.snippet.title;
  const titleMatch = containsYouTubePhrase(title, phrase);
  const hashtagMatch = exactHashtagMatch(`${title} ${item.snippet.description ?? ""}`, phrase);
  const strongContext = hasStrongGameContext(snippetContext);
  const syntaxMatch = gameTitleSyntax(title, phrase);
  const episodeMarker = /\b(part|episode|ep|chapter|run)\s*#?\d+/i.test(normalizeYouTubeWords(title));
  const repeatedTarget = phraseOccurrences(`${title} ${item.snippet.description ?? ""}`, phrase) >= 2;
  const foreignAnchor = hasForeignGameAnchor(snippetContext, includes);
  const mixedCoverage = explicitMixedCoverage(title);

  if (!titleMatch && !hashtagMatch) return false;
  if (foreignAnchor && !mixedCoverage) return false;

  let score = 0;
  if (titleMatch) score += 3;
  if (hashtagMatch) score += 1;
  if (strongContext) score += 2;
  if (syntaxMatch) score += 2;
  if (episodeMarker) score += 1;
  if (repeatedTarget) score += 1;
  return score >= 5;
}

function singleWordDetailedLooksIntentional(
  item: YouTubeSearchItem,
  detail: YouTubeVideoDetail,
  phrase: string,
  allContext: string,
  includes: string[],
) {
  const title = item.snippet.title;
  const titleMatch = containsYouTubePhrase(title, phrase);
  const hashtagMatch = exactHashtagMatch(`${title} ${item.snippet.description ?? ""}`, phrase) || exactTagMatch(detail.tags, phrase);
  const strongContext = hasStrongGameContext(allContext);
  const syntaxMatch = gameTitleSyntax(title, phrase);
  const episodeMarker = /\b(part|episode|ep|chapter|run)\s*#?\d+/i.test(normalizeYouTubeWords(title));
  const repeatedTarget = phraseOccurrences(`${title} ${item.snippet.description ?? ""}`, phrase) >= 2;
  const foreignAnchor = hasForeignGameAnchor(allContext, includes);
  const mixedCoverage = explicitMixedCoverage(title);

  if (!titleMatch && !hashtagMatch) return false;
  if (foreignAnchor && !mixedCoverage) return false;

  let score = 0;
  if (titleMatch) score += 3;
  if (hashtagMatch) score += 1;
  if (strongContext) score += 2;
  if (syntaxMatch) score += 2;
  if (episodeMarker) score += 1;
  if (repeatedTarget) score += 1;
  return score >= 5;
}

export function classifyYouTubeSearchCandidate(
  item: YouTubeSearchItem,
  includes: string[],
  excludes: string[],
): YouTubeCandidateDecision {
  const snippetContext = `${item.snippet.title} ${item.snippet.description ?? ""}`;

  if (excludes.some((phrase) => containsYouTubePhrase(snippetContext, phrase))) return "reject";

  const matchedIncludes = includes.filter((phrase) => containsYouTubePhrase(snippetContext, phrase));
  if (!matchedIncludes.length) return "needs_detail";

  // If the user configured exclusions, validate full video metadata before accepting.
  // This keeps an excluded tag/description from slipping through the quota-light path.
  if (excludes.length) return "needs_detail";

  const multiWordMatch = matchedIncludes.some((phrase) => youtubeWordCount(phrase) > 1);
  if (multiWordMatch) {
    const foreignAnchor = hasForeignGameAnchor(snippetContext, includes);
    return foreignAnchor && !explicitMixedCoverage(item.snippet.title) ? "reject" : "accept";
  }

  return matchedIncludes.some((phrase) => singleWordSnippetLooksIntentional(item, phrase, snippetContext, includes))
    ? "accept"
    : "needs_detail";
}

export function matchesYouTubeTrackedGame(
  item: YouTubeSearchItem,
  detail: YouTubeVideoDetail | undefined,
  includes: string[],
  excludes: string[],
) {
  if (!detail || detail.categoryId !== "20") return false;

  const allContext = [
    item.snippet.title,
    item.snippet.description ?? "",
    detail.description,
    ...detail.tags,
  ].join(" ");

  if (excludes.some((phrase) => containsYouTubePhrase(allContext, phrase))) return false;

  const matchedIncludes = includes.filter((phrase) => containsYouTubePhrase(allContext, phrase));
  if (!matchedIncludes.length) return false;

  const multiWordMatch = matchedIncludes.some((phrase) => youtubeWordCount(phrase) > 1);
  if (multiWordMatch) {
    const foreignAnchor = hasForeignGameAnchor(allContext, includes);
    return !foreignAnchor || explicitMixedCoverage(item.snippet.title);
  }

  return matchedIncludes.some((phrase) => singleWordDetailedLooksIntentional(item, detail, phrase, allContext, includes));
}
